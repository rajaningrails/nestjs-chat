import { Injectable } from '@nestjs/common';
import {
  CreateChatGroupDto,
  PartialCreateUserDto,
  UpdateGroupDto,
} from '../dto/chat-group.dto';
import { GroupRepository } from '../repositories/group.repository';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';
import { ConversationType } from 'src/modules/conversations/dto/conversations.enum';
import { MessageRepository } from 'src/modules/messages/repositories/message.repository';
import { generateSafeNumericId } from 'src/utils/helpers';
@Injectable()
export class GroupService {
  constructor(
    private readonly groupRepository: GroupRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  async createGroup(payload: {
    users: CreateUserDto[];
    group: CreateChatGroupDto;
  }) {
    const groupResponse = await this.groupRepository.create(payload.group);
    const { id: conversation_id } = await this.conversationRepository.save({
      school_id: payload.group.school_id,
      group_id: groupResponse?.id,
      type: ConversationType.GROUP,
      last_message_sender_id: payload?.group?.created_by,
    });
    const message_id = generateSafeNumericId();
    await this.messageRepository.save({
      message: 'New group has been created',
      conversation_id,
      sender_id: payload?.group?.created_by,
      group_id: groupResponse?.id,
      school_id: payload?.group?.school_id,
      id: message_id,
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
    return {
      ...groupResponse,
    };
  }

  async updateGroup(payload: {
    users: PartialCreateUserDto[];
    group: UpdateGroupDto;
  }) {
    const groupResponse = await this.groupRepository.update(payload.group);
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
}
