import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm';
import { IConversationRepository } from './conversation.repository.interface';
import { Conversation } from '../entities/conversation.entity';
import { buildConfigMap, toMySQLDate } from 'src/utils/helpers';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { UpdateConversationDto } from '../dto/update-conversation.dto';
import { ConversationType, GroupType } from '../dto/conversations.enum';
import { MessageRepository } from 'src/modules/messages/repositories/message.repository';
import { SocketService } from 'src/common/services/socket/socket.service';
import { RedisService } from 'src/common/services/redis.service';
import { DeleteConversationDto } from '../dto/conversation-delete.dto';
import { GroupRepository } from 'src/modules/group/repositories/group.repository';
import { UsersService } from 'src/modules/users/services/users.service';
import { S3PresignedUrlService } from 'src/common/services/aws.service';
import { CreateChatConfigDto } from 'src/modules/chat_configs/dto/chat-configs.dto';
import { ChatConfigRepository } from 'src/modules/chat_configs/repositories/chat-config.repository';
import { IChatConfigRepositoryToken } from 'src/modules/chat_configs/repositories/chat-config.repository.interface';

@Injectable()
export class ConversationRepository implements IConversationRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    private readonly messageRepository: MessageRepository,
    private readonly socketService: SocketService,
    private readonly redisService: RedisService,
    private readonly groupRepository: GroupRepository,
    private readonly userService: UsersService,
    private readonly s3Service: S3PresignedUrlService,
    @Inject(IChatConfigRepositoryToken)
    private readonly chatConfigRepository: ChatConfigRepository,
  ) {}

  private get redis() {
    return this.redisService.getClient();
  }

  async findAll(limit = 20, offset = 0): Promise<Conversation[]> {
    return this.conversationRepository.find({
      take: limit,
      skip: offset,
      order: {
        created_at: 'DESC',
      },
    });
  }
  async upsertBatch(conversations: Conversation[]): Promise<void> {
    if (!conversations.length) return;
    await this.conversationRepository
      .createQueryBuilder()
      .insert()
      .into(Conversation)
      .values(conversations)
      .orUpdate(
        [
          'group_type',
          'last_message_id',
          'last_message_sender_id',
          'last_message_receiver_id',
          'updated_at',
        ],
        ['id'],
      )
      .execute();
  }

  async findById(id: number): Promise<any | null> {
    const queryBuilder = this.conversationRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.group', 'group')
      .leftJoinAndSelect('c.lastMessage', 'lastMessage')
      .leftJoin(
        'users',
        'sender_user',
        'sender_user.user_id = c.last_message_sender_id',
      )
      .leftJoin(
        'users',
        'receiver_user',
        'receiver_user.user_id = c.last_message_receiver_id',
      )
      // Sender fields
      .addSelect('sender_user.user_id', 'sender_user_id')
      .addSelect('sender_user.name', 'sender_name')
      .addSelect('sender_user.image', 'sender_image')
      .addSelect('sender_user.type', 'sender_user_type')
      .addSelect('sender_user.is_admin', 'sender_is_admin')
      .addSelect('sender_user.class', 'sender_class')
      .addSelect('sender_user.section', 'sender_section')
      // Receiver fields
      .addSelect('receiver_user.user_id', 'receiver_user_id')
      .addSelect('receiver_user.name', 'receiver_name')
      .addSelect('receiver_user.image', 'receiver_image')
      .addSelect('receiver_user.type', 'receiver_user_type')
      .addSelect('receiver_user.is_admin', 'receiver_is_admin')
      .addSelect('receiver_user.class', 'receiver_class')
      .addSelect('receiver_user.section', 'receiver_section')
      .where('c.id = :id', { id })
      .andWhere('c.deleted_at IS NULL');

    const { entities, raw } = await queryBuilder.getRawAndEntities();

    const conversation = entities[0];
    const rawRow = raw[0];

    if (!conversation) return null;

    const convWithTypes = {
      ...conversation,
      type: conversation.type,
      group_type: conversation?.group_type,
      sender_user_type: rawRow?.sender_user_type,
      receiver_user_type: rawRow?.receiver_user_type,
    };

    const chatConfigs = await this.chatConfigRepository.findBy(
      String(conversation?.last_message_sender_id),
    );

    const isDisabled = !this.isConversationEnabled(
      convWithTypes,
      buildConfigMap(chatConfigs),
    );

    const [groupImage, senderImage, receiverImage] = await Promise.all([
      conversation?.group?.group_image
        ? this.s3Service.generatePresignedUrl(conversation.group.group_image)
        : Promise.resolve(null),
      rawRow?.sender_image
        ? this.s3Service.generatePresignedUrl(rawRow.sender_image)
        : Promise.resolve(null),
      rawRow?.receiver_image
        ? this.s3Service.generatePresignedUrl(rawRow.receiver_image)
        : Promise.resolve(null),
    ]);

    return {
      ...conversation,
      is_disabled: isDisabled,
      group: conversation.group
        ? {
            ...conversation.group,
            group_image: groupImage,
          }
        : null,
      sender_details: rawRow?.sender_user_id
        ? {
            user_id: rawRow.sender_user_id,
            name: rawRow.sender_name,
            image: senderImage,
            type: rawRow.sender_user_type,
            is_admin: rawRow.sender_is_admin,
            class: rawRow.sender_class,
            section: rawRow.sender_section,
          }
        : null,
      receiver_details: rawRow?.receiver_user_id
        ? {
            user_id: rawRow.receiver_user_id,
            name: rawRow.receiver_name,
            image: receiverImage,
            type: rawRow.receiver_user_type,
            is_admin: rawRow.receiver_is_admin,
            class: rawRow.receiver_class,
            section: rawRow.receiver_section,
          }
        : null,
    };
  }
  
  async save(conversationData: CreateConversationDto): Promise<Conversation> {
    const conversation = this.conversationRepository.create(conversationData);
    return this.conversationRepository.save(conversation);
  }

  async update(
    id: number,
    conversationData: Partial<UpdateConversationDto>,
  ): Promise<Conversation | null> {
    await this.conversationRepository.update(id, conversationData);
    return this.findById(id);
  }

  async checkIfConversationBetweenUserExists(
    user1Id: number,
    user2Id: number,
  ): Promise<Conversation | null> {
    return this.conversationRepository
      .createQueryBuilder('conversation')
      .where(
        new Brackets((qb) => {
          qb.where(
            'conversation.last_message_sender_id = :user1Id AND conversation.last_message_receiver_id = :user2Id',
            { user1Id, user2Id },
          ).orWhere(
            'conversation.last_message_sender_id = :user2Id AND conversation.last_message_receiver_id = :user1Id',
            { user1Id, user2Id },
          );
        }),
      )
      .getOne();
  }

  async updateLastMessageSafe(data: {
    conversationId: number;
    messageId: number;
    updateAt: Date;
  }) {
    await this.conversationRepository
      .createQueryBuilder()
      .update(Conversation)
      .set({
        last_message_id: data.messageId as any,
        updated_at: data.updateAt,
      })
      .where('id = :id', { id: data.conversationId })
      .execute();
  }

  async findByUserId(userId: number): Promise<Conversation[]> {
    try {
      const conversations = await this.conversationRepository.query(
        `
        SELECT DISTINCT c.*
        FROM conversations c
        LEFT JOIN chat_group_members gm ON gm.group_id = c.group_id
        WHERE ( 
          c.last_message_sender_id = $1
          OR c.last_message_receiver_id = $1 
          OR gm.user_id = $1
        )
        AND c.deleted_at IS NULL
        ORDER BY c.updated_at DESC
        `,
        [userId],
      );

      return conversations;
    } catch (error) {
      return [];
    }
  }

  async findConversationGroupMemberIds(
    conversationId: number,
  ): Promise<number[]> {
    const conversation = await this.conversationRepository
      .createQueryBuilder('conversation')
      .innerJoin('conversation.group', 'group')
      .innerJoin('group.members', 'member')
      .select('member.user_id')
      .where('conversation.id = :conversationId', { conversationId })
      .andWhere('conversation.deleted_at IS NULL')
      .getRawMany();

    return conversation.map((row) => row.member_user_id);
  }

  async softDelete(conversationId: number): Promise<boolean> {
    try {
      await this.conversationRepository.update(conversationId, {
        deleted_at: new Date(),
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  isConversationEnabled = (conv: any, chatConfigs: any): boolean => {
    if (conv.type === ConversationType.USER) {
      const senderType = conv.sender_user_type;
      const receiverType = conv.receiver_user_type;
      if (senderType === 'staff' && receiverType === 'staff') {
        return chatConfigs.has('teacher_to_teacher_chat');
      }
      if (
        (senderType === 'staff' && receiverType === 'student') ||
        (senderType === 'student' && receiverType === 'staff')
      ) {
        return chatConfigs.has('teacher_to_student_chat');
      }
    }
    if (conv.type === ConversationType.GROUP) {
      if (conv.group_type === 'student_group') {
        return chatConfigs.has('student_group_chat');
      }
      if (conv.group_type === 'teacher_group') {
        return chatConfigs.has('teacher_group_chat');
      }
    }
    return false;
  };

  async findConversation(
    school_id: number,
    conversationId: number,
  ): Promise<{
    conversation_exists: boolean;
    data: any;
    message: string;
  }> {
    try {
      const queryBuilder = this.conversationRepository
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.group', 'group')
        .leftJoinAndSelect('c.lastMessage', 'lastMessage')
        .leftJoin('group.members', 'gm')
        .leftJoin(
          'users',
          'sender_user',
          'sender_user.user_id = c.last_message_sender_id',
        )
        .leftJoin(
          'users',
          'receiver_user',
          'receiver_user.user_id = c.last_message_receiver_id',
        )
        // Sender user fields
        .addSelect('sender_user.user_id', 'sender_user_id')
        .addSelect('sender_user.name', 'sender_name')
        .addSelect('sender_user.image', 'sender_image')
        .addSelect('sender_user.type', 'sender_user_type')
        .addSelect('sender_user.is_admin', 'sender_is_admin')
        .addSelect('sender_user.class', 'sender_class')
        .addSelect('sender_user.section', 'sender_section')
        // Receiver user fields
        .addSelect('receiver_user.user_id', 'receiver_user_id')
        .addSelect('receiver_user.name', 'receiver_name')
        .addSelect('receiver_user.image', 'receiver_image')
        .addSelect('receiver_user.type', 'receiver_user_type')
        .addSelect('receiver_user.is_admin', 'receiver_is_admin')
        .addSelect('receiver_user.class', 'receiver_class')
        .addSelect('receiver_user.section', 'receiver_section')
        .where('c.school_id = :school_id', { school_id })
        .andWhere('c.deleted_at IS NULL')
        .andWhere('c.id = :conversationId', { conversationId });

      const conversationRaw = await queryBuilder
        .orderBy('c.updated_at', 'DESC')
        .getRawAndEntities();

      const conversation = conversationRaw.entities[0];
      const rawRow = conversationRaw.raw[0];

      if (!conversation) {
        return {
          conversation_exists: false,
          data: [],
          message: 'No conversation found',
        };
      }

      const convWithTypes = {
        ...conversation,
        type: conversation.type,
        group_type: conversation?.group_type,
        sender_user_type: rawRow?.sender_user_type,
        receiver_user_type: rawRow?.receiver_user_type,
      };

      const chatConfigs = await this.chatConfigRepository.findBy(
        String(conversation?.last_message_sender_id),
      );

      const isDisabled = !this.isConversationEnabled(
        convWithTypes,
        buildConfigMap(chatConfigs),
      );

      const [groupImage, senderImage, receiverImage] = await Promise.all([
        conversation?.group?.group_image
          ? this.s3Service.generatePresignedUrl(conversation.group.group_image)
          : Promise.resolve(null),
        rawRow?.sender_image
          ? this.s3Service.generatePresignedUrl(rawRow.sender_image)
          : Promise.resolve(null),
        rawRow?.receiver_image
          ? this.s3Service.generatePresignedUrl(rawRow.receiver_image)
          : Promise.resolve(null),
      ]);

      const data = {
        id: conversation.id,
        school_id: conversation.school_id,
        type: conversation.type,
        group_id: conversation.group_id,
        group_name: conversation.group?.group_name,
        group_image: groupImage,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
        last_message: conversation.lastMessage?.message,
        last_message_sender_id: conversation.last_message_sender_id,
        last_message_receiver_id: conversation.last_message_receiver_id,
        is_disabled: isDisabled,

        sender_details: rawRow?.sender_user_id
          ? {
              user_id: rawRow.sender_user_id,
              name: rawRow.sender_name,
              image: senderImage,
              type: rawRow.sender_user_type,
              is_admin: rawRow.sender_is_admin,
              class: rawRow.sender_class,
              section: rawRow.sender_section,
            }
          : null,

        receiver_details: rawRow?.receiver_user_id
          ? {
              user_id: rawRow.receiver_user_id,
              name: rawRow.receiver_name,
              image: receiverImage,
              type: rawRow.receiver_user_type,
              is_admin: rawRow.receiver_is_admin,
              class: rawRow.receiver_class,
              section: rawRow.receiver_section,
            }
          : null,
      };

      return {
        conversation_exists: true,
        data,
        message: 'Conversations found successfully',
      };
    } catch (error) {
      return {
        conversation_exists: false,
        data: [],
        message: 'Error retrieving conversations',
      };
    }
  }

  async latestConversations(
    limit = 10,
    page = 1,
    school_id = 1,
    user_id = 1,
    search = '',
  ): Promise<{
    conversations: any[];
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    idListRows: number[];
    chatIdListRows: string[];
  }> {
    try {
      const offset = (page - 1) * limit;

      const chatConfigs: CreateChatConfigDto[] =
        await this.chatConfigRepository.findBy(String(user_id));

      let baseQuery = `
      SELECT DISTINCT
        c.*,
        g.group_name as group_name,
        g.group_image as group_image,
        CASE 
          WHEN c.last_message_sender_id = ? THEN c.last_message_receiver_id
          ELSE c.last_message_sender_id
        END as other_user_id,
        u.name as other_user_name,
        u.image as other_user_profile_image,
        u.type as other_user_type,
        CASE 
          WHEN c.type = ? THEN 
            CASE WHEN seen.id IS NOT NULL THEN true ELSE false END
          ELSE NULL
        END as is_seen,
        m.message as last_message,
        m.attachments as last_message_attachments,
        m.created_at as last_message_created_at,
        m.deleted_at as last_message_delete_at,
        CASE 
          WHEN c.type = ? THEN seen.created_at
          ELSE m.seen_at
        END as last_message_seen_at
      FROM conversations c
      LEFT JOIN chat_groups g ON c.group_id = g.id
      LEFT JOIN chat_group_members gm ON g.id = gm.group_id
      LEFT JOIN users u ON (
        c.type = ? AND (
          (c.last_message_sender_id = u.user_id AND u.user_id != ?) OR
          (c.last_message_receiver_id = u.user_id AND u.user_id != ?)
        )
      )
      LEFT JOIN messages m ON c.last_message_id = m.id
      LEFT JOIN group_message_seen seen ON (
        seen.message_id = c.last_message_id AND seen.user_id = ?
      )
      WHERE c.school_id = ?
        AND c.deleted_at IS NULL
        AND (
          c.last_message_sender_id = ? OR
          c.last_message_receiver_id = ? OR
          gm.user_id = ?
        )
    `;

      const params: any[] = [
        user_id,
        ConversationType.GROUP,
        ConversationType.GROUP,
        ConversationType.USER,
        user_id,
        user_id,
        user_id,
        school_id,
        user_id,
        user_id,
        user_id,
      ];

      if (search && search.trim() !== '') {
        baseQuery += `
        AND (
          (c.type = ? AND (u.name LIKE ?))
          OR
          (c.type = ? AND g.group_name LIKE ?)
        )
      `;
        params.push(
          ConversationType.USER,
          `%${search}%`,
          ConversationType.GROUP,
          `%${search}%`,
        );
      }

      const countQuery = `
      SELECT COUNT(DISTINCT subquery.id) as total
      FROM (${baseQuery}) as subquery
    `;

      const countResult = await this.conversationRepository.query(
        countQuery,
        params,
      );
      const totalRecords = parseInt(countResult[0]?.total || '0');

      const dataQuery = `
      ${baseQuery}
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `;

      const conversations = await this.conversationRepository.query(dataQuery, [
        ...params,
        limit,
        offset,
      ]);

      const totalPages = Math.ceil(totalRecords / limit);
      const hasMore = page < totalPages;

      const processedConversations = await Promise.all(
        conversations.map(async (conv: any) => {
          const isDisabled = !this.isConversationEnabled(
            conv,
            buildConfigMap(chatConfigs),
          );

          const [userImage, groupImage, isOnline] = await Promise.all([
            conv.other_user_profile_image
              ? this.s3Service.generatePresignedUrl(
                  conv.other_user_profile_image,
                )
              : Promise.resolve(null),
            conv.group_image
              ? this.s3Service.generatePresignedUrl(conv.group_image)
              : Promise.resolve(null),
            conv.group_id
              ? Promise.resolve(false)
              : this.socketService.isUserOnline(conv?.other_user_id),
          ]);

          return {
            id: conv.id,
            type: conv.type,
            school_id: conv.school_id,
            sender_id: conv.last_message_sender_id,
            receiver_id: conv.last_message_receiver_id,
            group_id: conv.group_id,
            group_type: conv.group_type,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            last_message_id: conv.last_message_id,
            last_message: conv.last_message,
            last_message_sender_id: conv.last_message_sender_id,
            last_message_receiver_type: conv.other_user_type,
            last_message_seen_at: conv.last_message_seen_at,
            last_message_date: conv.last_message_created_at,
            is_only_teachers_group: conv.group_type,
            is_online: isOnline,
            group_name: conv.group_name,
            group_image: groupImage,
            group_creator_id: conv.created_by,
            attachments: conv.last_message_attachments,
            is_muted: 0,
            muted_by_ids: null,
            is_disabled: isDisabled,
            deleteMessageFlag: conv.last_message_delete_at ? 1 : 0,
            user_id:
              conv.type === ConversationType.USER ? conv.other_user_id : null,
            user_details:
              conv.type === ConversationType.USER && conv.other_user_id
                ? {
                    id: conv.other_user_id,
                    name: conv.other_user_name,
                    image: userImage,
                    class: null,
                    section: null,
                  }
                : null,
          };
        }),
      );

      const idListRows = processedConversations
        .filter((conv) => conv.type === ConversationType.USER && conv.user_id)
        .map((conv) => conv.user_id);

      const chatIdListRows = processedConversations.map((conv) => conv.id);

      return {
        conversations: processedConversations,
        hasMore,
        currentPage: page,
        totalPages,
        totalRecords,
        idListRows,
        chatIdListRows,
      };
    } catch (error) {
      console.error('Error fetching latest conversations:', error);
      return {
        conversations: [],
        hasMore: false,
        currentPage: page,
        totalPages: 0,
        totalRecords: 0,
        idListRows: [],
        chatIdListRows: [],
      };
    }
  }

  async getConversationMessagesWithBuffer(
    conversationId: number,
    limit: number,
    offset: number,
  ) {
    const [bufferedRaw, dbMessages, totalRecords, conversationInfo] = await Promise.all([
      this.redis.lrange(`buffer:message:create:${conversationId}`, 0, -1),
      this.messageRepository.getConversationMessages(
        conversationId,
        limit,
        offset,
      ),
      this.messageRepository.countConversationMessage(conversationId),
      this.conversationRepository.findOneBy({ id: conversationId }),
    ]);

    const buffered = bufferedRaw
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter((m) => m !== null);

    const dbIds = new Set(dbMessages.map((m) => m.id?.toString()));
    const newBuffered = buffered.filter((m) => !dbIds.has(m.id?.toString()));

    const presign = async (msg) => {
      const result = { ...msg };
      if (result.attachments?.length) {
        result.attachments = await this.s3Service.generatePresignedUrls(
          result.attachments,
        );
      }
      if (result.sender?.image) {
        result.sender = {
          ...result.sender,
          image: await this.s3Service.generatePresignedUrl(result.sender.image),
        };
      }
      if (result.group?.group_image) {
        result.group = {
          ...result.group,
          group_image: await this.s3Service.generatePresignedUrl(
            result.group.group_image,
          ),
        };
      }
      if(result?.group_id){
        result['user_details'] = {
          ...result.sender
        }
      }else{
        result['user_details'] = {
          ...result.receiver
        }
      }
      delete result.sender;
      delete result.receiver;
      return result;
    };

    const [presignedDb, presignedBuffered] = await Promise.all([
      Promise.all(dbMessages.map(presign)),
      Promise.all(newBuffered.map(presign)),
    ]);

    const merged = [...presignedBuffered, ...presignedDb].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    const adjustedTotal = totalRecords + newBuffered.length;
    const chatConfigs = await this.chatConfigRepository.findBy(
      String(conversationInfo?.last_message_sender_id),
    );

    const isDisabled = !this.isConversationEnabled(
      conversationInfo,
      buildConfigMap(chatConfigs),
    );
    return {
      message: 'Messages retrieved successfully',
      data: merged,
      hasMore: offset + limit < adjustedTotal,
      totalRecords: adjustedTotal,
      currentPage: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(adjustedTotal / limit),
      status: true,
      success: true,
      conversationInfo,
      is_disabled: isDisabled,
    };
  }

  async deleteAllMessages(request: DeleteConversationDto) {
    const conversationExists = await this.findById(request.conversationID!);

    if (!conversationExists) {
      throw new NotFoundException('Conversation not found!');
    }

    const userDetail = await this.userService.findUserById(request.senderID!);
    if (!userDetail) {
      throw new NotFoundException('Sender not found!');
    }

    const messageData = {
      conversationID: request.conversationID!,
      senderID: request.senderID,
      receiverID: request.receiverID,
      groupID: request.groupID,
      senderName: userDetail.name,
      senderImage: userDetail.image,
    };

    await this.conversationRepository.softDelete(request.conversationID!);
    if (Number(request.groupID)) {
      await this.groupRepository.softDelete(Number(request.groupID));
      await this.socketService.emitToGroupMembers(
        Number(request.groupID),
        'allMessagesDeleted',
        messageData,
      );
    } else {
      await this.socketService.emitToUsers(
        [Number(request.receiverID), Number(request.senderID)],
        'allMessagesDeleted',
        messageData,
      );
    }
    return {
      success: true,
      message: 'Conversation deleted successfully',
    };
  }
}
