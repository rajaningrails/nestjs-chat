import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatGroup } from '../entities/chat-group.entity';
import { ChatGroupMember } from '../entities/chat-group-member.entity';
import {
  ICreateGroup,
  IGroupRepository,
} from './group.repository.interface';

@Injectable()
export class GroupRepository implements IGroupRepository {
  constructor(
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,
    @InjectRepository(ChatGroupMember)
    private readonly groupMemberRepo: Repository<ChatGroupMember>,
  ) {}

  async findGroupByName(group_name: string): Promise<boolean> {
    const existingGroup = await this.groupRepo.findOne({
      where: { group_name: group_name?.trim()?.toLowerCase() },
    });
    return !!existingGroup;
  }

  async create(data: ICreateGroup): Promise<{
    group_id: number;
  }> {
    const {
      school_id,
      group_name,
      created_by,
      image,
      studentDetails = [],
      staffDetails = [],
    } = data;

    const group = this.groupRepo.create({
      school_id,
      group_name: group_name.trim(),
      group_image: image,
      created_by,
    });

    const savedGroup = await this.groupRepo.save(group);
    const groupId = savedGroup.id;

    await this.groupMemberRepo.save({
      group_id: groupId,
      user_id: created_by,
    });

    if (studentDetails.length > 0) {
      const studentMembers = studentDetails.map((s) => ({
        group_id: groupId,
        user_id: s.id,
      }));
      await this.groupMemberRepo.save(studentMembers);
    }

    if (staffDetails.length > 0) {
      const staffMembers = staffDetails
        .filter((s) => s.id !== created_by)
        .map((s) => ({
          group_id: groupId,
          user_id: s.id,
        }));
      if (staffMembers.length > 0) {
        await this.groupMemberRepo.save(staffMembers);
      }
    }

    return { group_id: groupId };
  }
}
