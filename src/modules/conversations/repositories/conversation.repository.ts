import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm';
import { IConversationRepository } from './conversation.repository.interface';
import { Conversation } from '../entities/conversation.entity';
import { toMySQLDate } from 'src/utils/helpers';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { UpdateConversationDto } from '../dto/update-conversation.dto';
import { ConversationType } from '../dto/conversations.enum';
import { MessageRepository } from 'src/modules/messages/repositories/message.repository';

@Injectable()
export class ConversationRepository implements IConversationRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    private readonly messageRepository: MessageRepository,
  ) {}

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
          'group_id',
          'updated_at'
        ],
        ['id'],
      )
      .execute();
  }
  async findById(id: number): Promise<Conversation | null> {
    return this.conversationRepository.findOne({
      where: { id },
      withDeleted: false,
    });
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
    const createdAt = toMySQLDate(data.updateAt);
    await this.conversationRepository
      .createQueryBuilder()
      .update(Conversation)
      .set({
        last_message_id: data.messageId as any,
        updated_at: data.updateAt,
      })
      .where('id = :id', { id: data.conversationId })
      .andWhere('(updated_at IS NULL OR updated_at <= :createdAt)', {
        createdAt,
      })
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

  async findConversation(
    school_id: number,
    sender_id: number,
    receiver_id: number | null,
    type: ConversationType,
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
        .where('c.school_id = :school_id', { school_id })
        .andWhere('c.type = :type', { type })
        .andWhere('c.deleted_at IS NULL');

      queryBuilder.andWhere(
        '(c.last_message_sender_id = :sender_id OR c.last_message_receiver_id = :sender_id OR gm.user_id = :sender_id)',
        { sender_id },
      );

      if (receiver_id !== null) {
        queryBuilder.andWhere(
          '(c.last_message_sender_id = :receiver_id OR c.last_message_receiver_id = :receiver_id)',
          { receiver_id },
        );
      }

      const conversations = await queryBuilder
        .orderBy('c.updated_at', 'DESC')
        .getOne();

      if (!conversations) {
        return {
          conversation_exists: false,
          data: [],
          message: 'No conversation found',
        };
      }

      const data = {
        id: conversations.id,
        school_id: conversations.school_id,
        sender_id,
        user_id: receiver_id,
        type: conversations.type,
        group_id: conversations.group_id,
        group_name: conversations.group?.group_name,
        group_image: conversations.group?.group_image,
        created_at: conversations.created_at,
        updated_at: conversations.updated_at,
        last_message: conversations.lastMessage,
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

      let baseQuery = `
        SELECT DISTINCT
          c.*,
          g.name as group_name,
          g.image as group_image,
          g.type as group_type_name,
          CASE 
            WHEN c.last_message_sender_id = $3 THEN c.last_message_receiver_id
            ELSE c.last_message_sender_id
          END as other_user_id,
          u.name as other_user_name,
          u.profile_image as other_user_profile_image,
          CASE 
            WHEN c.type = $6 THEN 
              CASE WHEN seen.id IS NOT NULL THEN true ELSE false END
            ELSE NULL
          END as is_seen,
          m.content as last_message_content,
          m.created_at as last_message_created_at
        FROM conversations c
        LEFT JOIN chat_groups g ON c.group_id = g.id
        LEFT JOIN group_members gm ON g.id = gm.group_id
        LEFT JOIN users u ON (
          c.type = $5 AND (
            (c.last_message_sender_id = u.id AND u.id != $3) OR
            (c.last_message_receiver_id = u.id AND u.id != $3)
          )
        )
        LEFT JOIN messages m ON c.last_message_id = m.id
        LEFT JOIN chat_group_message_seen seen ON (
          seen.message_id = c.last_message_id AND seen.user_id = $3
        )
        WHERE c.school_id = $1
          AND c.deleted_at IS NULL
          AND (
            c.last_message_sender_id = $3 OR
            c.last_message_receiver_id = $3 OR
            gm.user_id = $3
          )
      `;

      const params: any[] = [
        school_id, 
        limit, 
        user_id, 
        offset, 
        ConversationType.USER, 
        ConversationType.GROUP, 
      ];

      if (search && search.trim() !== '') {
        baseQuery += `
          AND (
            (c.type = $5 AND (u.name ILIKE $7))
            OR
            (c.type = $6 AND g.name ILIKE $7)
          )
        `;
        params.push(`%${search}%`);
      }

      const countQuery = `
        SELECT COUNT(DISTINCT c.id) as total
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
        LIMIT $2 OFFSET $4
      `;

      const conversations = await this.conversationRepository.query(
        dataQuery,
        params,
      );

      const totalPages = Math.ceil(totalRecords / limit);
      const hasMore = page < totalPages;

      const processedConversations = conversations.map((conv) => ({
        id: conv.id,
        school_id: conv.school_id,
        type: conv.type,
        group_id: conv.group_id,
        group_type: conv.group_type,
        last_message_id: conv.last_message_id,
        last_message_sender_id: conv.last_message_sender_id,
        last_message_receiver_id: conv.last_message_receiver_id,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        lastMessage: conv.last_message_id
          ? {
              id: conv.last_message_id,
              content: conv.last_message_content,
              created_at: conv.last_message_created_at,
            }
          : null,
        group: conv.group_id
          ? {
              id: conv.group_id,
              name: conv.group_name,
              image: conv.group_image,
              type: conv.group_type_name,
            }
          : null,
        other_user_id:
          conv.type === ConversationType.USER ? conv.other_user_id : null,
        other_user:
          conv.type === ConversationType.USER && conv.other_user_id
            ? {
                id: conv.other_user_id,
                name: conv.other_user_name,
                profile_image: conv.other_user_profile_image,
              }
            : null,
        is_seen: conv.is_seen,
      }));

      const idListRows = processedConversations
        .filter(
          (conv) => conv.type === ConversationType.USER && conv.other_user_id,
        )
        .map((conv) => conv.other_user_id);

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

  async getConversationMessages(conversation_id: number, limit = 25, page = 1) {
    try {
      const conversation_exists = await this.conversationRepository.findOne({
        where: {
          id: conversation_id,
          deleted_at: IsNull(),
        },
      });

      if (!conversation_exists) {
        return {
          message: 'Conversation not found',
          data: [],
          currentPage: page,
          hasMore: false,
          totalPages: 0,
          totalItems: 0,
          totalRecords: 0,
        };
      }

      const offset = (page - 1) * limit;

      const totalRecords =
        await this.messageRepository.countConversationMessage(conversation_id);

      const messages = await this.messageRepository.getConversationMessages(
        conversation_id,
        limit,
        offset,
      );

      const totalPages = Math.ceil(totalRecords / limit);
      const hasMore = page < totalPages;

      const formattedMessages = messages.map((message) => {
        if (conversation_exists.type === ConversationType.GROUP) {
          return {
            ...message,
            user_details: null,
          };
        }
        return message;
      });

      return {
        message: 'Messages retrieved successfully',
        data: formattedMessages.reverse(),
        currentPage: page,
        hasMore,
        totalPages,
        totalItems: messages.length,
        totalRecords,
      };
    } catch (error) {
      return {
        message: 'Error retrieving messages',
        data: [],
        currentPage: page,
        hasMore: false,
        totalPages: 0,
        totalItems: 0,
        totalRecords: 0,
      };
    }
  }
}
