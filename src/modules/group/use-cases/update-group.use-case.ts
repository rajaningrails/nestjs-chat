import { v4 as uuidv4 } from 'uuid';
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IGroupRepositoryToken } from '../repositories/group.repository.interface';
import {
  GroupType,
} from 'src/modules/conversations/dto/conversations.enum';
import { GroupRepository } from '../repositories/group.repository';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { PartialCreateUserDto, UpdateGroupDto } from '../dto/chat-group.dto';
import { UserService } from 'src/modules/users/services/user.service';
import { GroupService } from '../service/group.service';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';

@Injectable()
export class UpdateGroupUseCase {
  constructor(
    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
    private readonly userService: UserService,
    private readonly groupService: GroupService,
    private readonly userRepository: UserRepository,
  ) {}
  private async ensureUsersExist(
    members: PartialCreateUserDto[],
    school_id: number,
  ) {
    if (members.length === 0) return;
    const existingUsers = await this.userRepository.findByUserIds(
      members.map((m) => m.id),
    );
    const existingIds = new Set(existingUsers.map((u) => u.user_id));
    const missingUsers = members.filter((m) => !existingIds.has(m.id));

    if (missingUsers.length > 0) {
      const usersToCreate: CreateUserDto[] = missingUsers.map((m) => ({
        user_id: m.id,
        name: m.name,
        image: m.image ?? null,
        school_id: school_id,
        type: m.type,
        id: uuidv4(),
      }));
      await this.userService.createUsers(usersToCreate);
    }
  }
  async execute(
    request: UpdateGroupDto,
  ): Promise<{ conversation_id: string; group_id: string }> {
    const exists = await this.groupRepository.findById(request.group_id!);
    if (!exists) {
      throw new NotFoundException('Group does not exists');
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
    await this.ensureUsersExist(allMembers, request.school_id!);

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
    await this.groupService.updateGroup(request);
    return {
      conversation_id: exists.conversations[0].id,
      group_id: request.group_id,
    };
  }
}
