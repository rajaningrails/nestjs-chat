import { v4 as uuidv4 } from 'uuid';
import { Injectable, ConflictException, Inject } from '@nestjs/common';
import {
  ICreateGroup,
  IGroupRepositoryToken,
} from '../repositories/group.repository.interface';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';
import { MessageRepository } from 'src/modules/messages/repositories/message.repository';
import {
  ConversationType,
  GroupType,
} from 'src/modules/conversations/dto/conversations.enum';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { GroupRepository } from '../repositories/group.repository';
import { UserType } from 'src/modules/users/dto/user-type.enum';
interface IMember {
  id: number;
  name: string;
  email: string | null;
  image: string | null;
  type: UserType;
}
@Injectable()
export class CreateGroupUseCase {
  constructor(
    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly userRepository: UserRepository,
  ) {}

  private async ensureUsersExist(members: IMember[], school_id: number) {
    if (members.length === 0) return;
    const existingUsers = await this.userRepository.findByUserIds(
      members.map((m) => m.id),
    );
    const existingIds = new Set(existingUsers.map((u) => u.user_id));
    const missingUsers = members.filter((m) => !existingIds.has(m.id));

    if (missingUsers.length > 0) {
      const usersToCreate = missingUsers.map((m) => ({
        user_id: m.id,
        name: m.name,
        image: m.image || null,
        school_id: school_id,
        type: m.type,
      }));
      await this.userRepository.bulkCreate(usersToCreate);
    }
  }

  async execute(
    request: ICreateGroup,
  ): Promise<{ conversation_id: number; group_id: number }> {
    const exists = await this.groupRepository.findGroupByName(
      request.group_name,
    );
    if (exists) {
      throw new ConflictException('Group name already exists');
    }
    request.studentDetails = request.studentDetails?.map((m) => ({
      ...m,
      type: UserType.STUDENT,
    }));
    request.staffDetails = request.staffDetails?.map((m) => ({
      ...m,
      type: UserType.STAFF,
    }));
    const allMembers = [
      ...(request.studentDetails || []),
      ...(request.staffDetails || []),
    ];

    await this.ensureUsersExist(allMembers, request.school_id);

    let group_type: GroupType = GroupType.STUDENTS_GROUP;
    if (
      request.studentDetails?.length > 0 &&
      (!request.staffDetails || request.staffDetails.length === 0)
    ) {
      group_type = GroupType.STUDENTS_GROUP;
    } else if (
      request.staffDetails?.length > 0 &&
      (!request.studentDetails || request.studentDetails.length === 0)
    ) {
      group_type = GroupType.TEACHERS_GROUP;
    }

    const { group_id } = await this.groupRepository.create(request);

    const savedConversation = await this.conversationRepository.save({
      school_id: request.school_id,
      type: ConversationType.GROUP,
      group_id,
      group_type,
      last_message: 'New group has been created',
      last_message_sender_id: request.created_by,
      last_message_receiver_id: null,
      last_message_seen_at: null,
    });

    const conversationId = Number(savedConversation.id);

    const savedMessage = await this.messageRepository.save({
      conversation_id: Number(conversationId),
      school_id: request.school_id,
      sender_id: request.created_by,
      id: uuidv4(),
      group_id,
      message: 'New group has been created',
      delivered_at: new Date(),
    });

    await this.conversationRepository.update(conversationId, {
      last_message_id: savedMessage.id,
      updated_at: new Date(),
    });

    return {
      conversation_id: conversationId,
      group_id,
    };
  }
}
