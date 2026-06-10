import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { IGroupRepositoryToken } from '../repositories/group.repository.interface';
import { GroupType } from 'src/modules/conversations/dto/conversations.enum';
import { GroupRepository } from '../repositories/group.repository';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { CreateChatGroupDto } from '../dto/chat-group.dto';
import { GroupService } from '../service/group.service';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';
import { S3PresignedUrlService } from 'src/common/services/aws.service';

@Injectable()
export class CreateGroupUseCase {
  constructor(
    @Inject(IGroupRepositoryToken)
    private readonly groupRepository: GroupRepository,
    private readonly groupService: GroupService,
    private readonly s3Service: S3PresignedUrlService,
  ) {}

  async execute(request: CreateChatGroupDto) {
    const exists = await this.groupRepository.findGroupByName(
      request.group_name,
      request.school_id
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

    const allMembers = [
      ...(request.studentDetails || []),
      ...(request.staffDetails || []),
    ];

    await this.groupService.assertGroupTypeAllowed(
      request.created_by,
      group_type,
    );
    const users: CreateUserDto[] = allMembers
      .filter((p) => p.type !== undefined)
      .map((p) => ({
        user_id: p.id,
        school_id: request.school_id,
        type: p.type!,
        image: p.image,
        name: p.name,
      }));

    const groupResponse = await this.groupService.createGroup({
      users,
      group: {
        created_by: request.created_by,
        image: request?.image?.[0],
        group_name: request.group_name,
        school_id: request.school_id,
      },
      group_type,
    });

    return groupResponse;
  }
}
