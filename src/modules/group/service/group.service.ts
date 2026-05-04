import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  CreateChatGroupDto,
  PartialCreateUserDto,
  UpdateGroupDto,
} from '../dto/chat-group.dto';
import { GroupRepository } from '../repositories/group.repository';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';
import {
  ConversationType,
  GroupType,
} from 'src/modules/conversations/dto/conversations.enum';
import { MessageRepository } from 'src/modules/messages/repositories/message.repository';
import { buildConfigMap, generateSafeNumericId } from 'src/utils/helpers';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { SocketService } from 'src/common/services/socket/socket.service';
import { S3PresignedUrlService } from 'src/common/services/aws.service';
import { IChatConfigRepositoryToken } from 'src/modules/chat_configs/repositories/chat-config.repository.interface';
import { ChatConfigRepository } from 'src/modules/chat_configs/repositories/chat-config.repository';
@Injectable()
export class GroupService {
  constructor(
    private readonly groupRepository: GroupRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly userRepository: UserRepository,
    private readonly socketService: SocketService,
    private readonly s3Service: S3PresignedUrlService,
    @Inject(IChatConfigRepositoryToken)
    private readonly chatConfigRepository: ChatConfigRepository,
  ) {}

  async createGroup(payload: {
    users: CreateUserDto[];
    group: CreateChatGroupDto;
    group_type: GroupType;
  }) {
    await this.userRepository.upsertUsers(payload.users);
    const groupResponse = await this.groupRepository.create(payload.group);
    const { id: conversation_id } = await this.conversationRepository.save({
      school_id: payload.group.school_id,
      group_id: groupResponse.id,
      type: ConversationType.GROUP,
      last_message_sender_id: payload?.group?.created_by,
      group_type: payload?.group_type,
    });
    const message_id = generateSafeNumericId();
    await this.messageRepository.save({
      message: 'New group has been created',
      conversation_id,
      message_sender_id: payload?.group?.created_by,
      group_id: groupResponse?.id,
      school_id: payload?.group?.school_id,
      id: message_id,
      created_at: new Date(),
      updated_at: new Date(),
    });
    await this.conversationRepository.updateLastMessageSafe({
      conversationId: conversation_id,
      updateAt: new Date(),
      messageId: message_id,
    });
    await this.groupRepository.upsertMemberBatch(
      payload.users?.map((m) => ({
        group_id: groupResponse?.id,
        user_id: m.user_id,
      })),
    );
    const s3ServiceImage = await this.s3Service.generatePresignedUrl(
      groupResponse?.group_image!,
    );
    await this.socketService.emitToGroupMembers(
      groupResponse?.id,
      'group-created',
      {
        group_id: groupResponse?.id,
        group_name: groupResponse?.group_name,
        group_image: s3ServiceImage,
        last_message: 'New group has been created',
        conversation_id: conversation_id,
        last_message_id: message_id,
        created_at: new Date(),
        sender_id: payload?.group?.created_by,
      },
    );
    return {
      ...groupResponse,
    };
  }

  async updateGroup(payload: {
    users: PartialCreateUserDto[];
    group: UpdateGroupDto;
  }) {
    const groupResponse = await this.groupRepository.update(payload.group);
    await this.groupRepository.removeMembers(groupResponse?.group_id);
    await this.groupRepository.upsertMemberBatch(
      payload.users?.map((m) => ({
        group_id: groupResponse?.group_id,
        user_id: m.id,
      })),
    );
    return {
      ...groupResponse,
    };
  }

  async groupMessageSeenBatch(
    payload: {
      id: number;
      conversation_id: number;
      seen_update_sender_id: number;
      seen_update_receiver_id?: number;
      group_id: number;
    }[],
  ) {
    return await this.groupRepository.groupMessageSeenBatch(payload);
  }

  async assertGroupTypeAllowed(
    userId: number,
    groupType: GroupType,
  ): Promise<void> {
    const chatConfigs = await this.chatConfigRepository.findBy(String(userId));
    const configMap = buildConfigMap(chatConfigs);

    const featureKey =
      groupType === GroupType.TEACHERS_GROUP
        ? 'teacher_group_chat'
        : 'student_group_chat';

    if (configMap.get(featureKey) !== 1 && configMap.has(featureKey)) {
      throw new ForbiddenException(
        `You are not allowed to manage ${groupType === GroupType.TEACHERS_GROUP ? 'staff' : 'student'} groups`,
      );
    }
  }
}
