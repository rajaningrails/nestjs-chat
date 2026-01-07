import { Injectable, ConflictException, Inject } from '@nestjs/common';
import {
  IGroupRepositoryToken,
  IUpdateGroup,
} from '../repositories/group.repository.interface';
import { GroupType } from 'src/modules/conversations/dto/conversations.enum';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { GroupRepository } from '../repositories/group.repository';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { ChatGroupMemberDto, UpdateGroupDto } from '../dto/chat-group.dto';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';

@Injectable()
export class UpdateGroupUseCase {
  constructor(
    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
    private readonly userRepository: UserRepository,
  ) {}

  private async ensureUsersExist(members: ChatGroupMemberDto[], school_id: number) {
    if (members.length === 0) return;
    const existingUsers = await this.userRepository.findByUserIds(
      members.map((m) => m.id),
    );
    const existingIds = new Set(existingUsers.map((u) => u.user_id));
    const missingUsers = members.filter((m) => !existingIds.has(m.id));

    if (missingUsers.length > 0) {
      const usersToCreate:CreateUserDto[] = missingUsers.map((m) => ({
        user_id: m.id,
        name: m.name,
        image: m.image || null,
        school_id: school_id,
        type: m.type,
      }));
      await this.userRepository.bulkCreate(usersToCreate);
    }
  }

  async execute(request: UpdateGroupDto): Promise<{ group_id: number }> {
    const exists = await this.groupRepository.findById(request.group_id!);
    if (!exists) {
      throw new ConflictException('Group does not exists');
    }

    const existingGroup = await this.groupRepository.findGroupByName(
      request.group_name!,
      request.group_id!,
    );

    if (existingGroup) {
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

    await this.ensureUsersExist(allMembers, request.school_id!);

    let group_type: GroupType = GroupType.STUDENTS_GROUP;
    if (
      request.studentDetails!?.length > 0 &&
      (!request.staffDetails || request.staffDetails.length === 0)
    ) {
      group_type = GroupType.STUDENTS_GROUP;
    } else if (
      request.staffDetails!?.length > 0 &&
      (!request.studentDetails || request.studentDetails.length === 0)
    ) {
      group_type = GroupType.TEACHERS_GROUP;
    }

    const { group_id } = await this.groupRepository.update(request);

    return {
      group_id,
    };
  }
}
