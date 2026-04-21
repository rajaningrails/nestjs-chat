import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IGroupRepositoryToken } from '../repositories/group.repository.interface';
import { GroupType } from 'src/modules/conversations/dto/conversations.enum';
import { GroupRepository } from '../repositories/group.repository';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { PartialCreateUserDto, UpdateGroupDto } from '../dto/chat-group.dto';
import { GroupService } from '../service/group.service';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';
import { S3PresignedUrlService } from 'src/common/services/aws.service';

@Injectable()
export class UpdateGroupUseCase {
  constructor(
    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
    private readonly groupService: GroupService,
    private readonly userRepository: UserRepository,
    private readonly s3Service: S3PresignedUrlService,
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
        school_id,
        type: m.type,
        image: m.image,
        name: m.name,
      }));
      await this.userRepository.upsertUsers(usersToCreate);
    }
  }

  async execute(request: UpdateGroupDto) {
    const exists = await this.groupRepository.findById(request.group_id!);
    if (!exists) {
      throw new NotFoundException('Group does not exist');
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

    // Presign group image + all member images in parallel
    const [groupImage, ...memberImages] = await Promise.all([
      request.group_image
        ? this.s3Service.generatePresignedUrl(request.group_image)
        : Promise.resolve(null),
      ...allMembers.map((m) =>
        m.image
          ? this.s3Service.generatePresignedUrl(m.image)
          : Promise.resolve(null),
      ),
    ]);

    const presignedMembers = allMembers.map((m, index) => ({
      ...m,
      image: memberImages[index]!,
    }));

    await this.ensureUsersExist(presignedMembers, request.school_id!);

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

    const response = await this.groupService.updateGroup({
      users: presignedMembers,
      group: {
        created_by: request.created_by,
        group_image: groupImage!,
        group_name: request.group_name,
        school_id: request.school_id,
        group_id: request.group_id,
      },
    });

    return response;
  }
}