import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { IGroupRepositoryToken } from '../repositories/group.repository.interface';
import {
  ConversationType,
  GroupType,
} from 'src/modules/conversations/dto/conversations.enum';
import { GroupRepository } from '../repositories/group.repository';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { CreateChatGroupDto } from '../dto/chat-group.dto';
import { GroupService } from '../service/group.service';
import { CreateChatGroupMemberDto } from '../dto/chat-group-member.dto';
import { generateSafeNumericId } from 'src/utils/helpers';

@Injectable()
export class CreateGroupUseCase {
  constructor(
    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
    private readonly groupService: GroupService,
  ) {}

  async execute(
    request: CreateChatGroupDto,
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
    const users = allMembers?.map((p) => ({
      user_id: p.id,
      name: p.name,
      image: p.image ?? '',
      school_id: request.school_id,
      type: p.type,
      id: generateSafeNumericId(),
    }));

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
    const conversation_id = generateSafeNumericId();
    const message_id = generateSafeNumericId();
    const group_id = generateSafeNumericId();
    request.id = group_id;

    const members: CreateChatGroupMemberDto[] = allMembers.map((m) => ({
      group_id: group_id,
      id: generateSafeNumericId(),
      user_id: m.id,
    }));
    await this.groupService.createGroup({
      users,
      group_members: members,
      conversation: {
        id: conversation_id,
        school_id: request.school_id,
        type: ConversationType.GROUP,
        group_id: request.id,
        group_type,
        last_message_sender_id: request.created_by,
        last_message_id: message_id,
      },
      message: {
        conversation_id,
        id: message_id,
        school_id: request.school_id,
        sender_id: request.created_by,
        group_id: group_id,
        message: 'New group has been created',
      },
    });

    return {
      conversation_id,
      group_id: request.id,
    };
  }
}
