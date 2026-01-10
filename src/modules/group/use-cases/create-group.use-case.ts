import { v4 as uuidv4 } from 'uuid';
import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { IGroupRepositoryToken } from '../repositories/group.repository.interface';
import {
  ConversationType,
  GroupType,
} from 'src/modules/conversations/dto/conversations.enum';
import { GroupRepository } from '../repositories/group.repository';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { CreateChatGroupDto } from '../dto/chat-group.dto';
import { UserService } from 'src/modules/users/services/user.service';
import { GroupService } from '../service/group.service';
import { ConversationService } from 'src/modules/conversations/services/conversation.service';
import { MessageService } from 'src/modules/messages/services/message.service';

@Injectable()
export class CreateGroupUseCase {
  constructor(
    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
    private readonly userService: UserService,
    private readonly conversationService: ConversationService,
    private readonly groupService: GroupService,
    private readonly messageService: MessageService,
  ) {}

  async execute(
    request: CreateChatGroupDto,
  ): Promise<{ conversation_id: string; group_id: string }> {
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

    await this.userService.createUsers(
      allMembers?.map((p) => ({
        user_id: p.id,
        name: p.name,
        image: p.image || null,
        school_id: request.school_id,
        type: p.type,
        id: uuidv4(),
      })),
    );

    let group_type: GroupType = GroupType.STUDENTS_GROUP;
    if (
      request.studentDetails &&
      request.studentDetails?.length > 0 &&
      (!request.staffDetails || request.staffDetails.length === 0)
    ) {
      group_type = GroupType.STUDENTS_GROUP;
    } else if (
      request.staffDetails &&
      request.staffDetails?.length > 0 &&
      (!request.studentDetails || request.studentDetails.length === 0)
    ) {
      group_type = GroupType.TEACHERS_GROUP;
    }
    const conversation_id = uuidv4();
    const message_id = uuidv4();
    const group_id = uuidv4();
    request.id = group_id;

    await this.groupService.createGroup(request);
    await this.conversationService.createConversation({
      id: conversation_id,
      school_id: request.school_id,
      type: ConversationType.GROUP,
      group_id: request.id,
      group_type,
      last_message_sender_id: request.created_by,
      last_message_id: message_id,
    });
    await this.messageService.createMessage({
      conversation_id,
      id: message_id,
      school_id: request.school_id,
      sender_id: request.created_by,
      group_id: group_id,
      message: 'New group has been created',
    });
    return {
      conversation_id,
      group_id: request.id,
    };
  }
}
