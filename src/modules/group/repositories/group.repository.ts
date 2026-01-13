import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ChatGroup } from '../entities/chat-group.entity';
import { ChatGroupMember } from '../entities/chat-group-member.entity';
import {
  IGroupRepository,
  IRepositoryGroupResponse,
} from './group.repository.interface';
import { CreateChatGroupDto, UpdateGroupDto } from '../dto/chat-group.dto';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { CreateChatGroupMemberDto } from '../dto/chat-group-member.dto';
import { GroupMessageSeen } from '../entities/chat-group-message-seen.entity';

@Injectable()
export class GroupRepository implements IGroupRepository {
  constructor(
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,

    @InjectRepository(ChatGroupMember)
    private readonly groupMemberRepo: Repository<ChatGroupMember>,

    @InjectRepository(GroupMessageSeen)
    private readonly groupMessageSeenRepo: Repository<GroupMessageSeen>,
  ) {}
  async upsertBatch(groups: Partial<ChatGroup>[]): Promise<void> {
    if (!groups.length) return;

    const values = groups.map((g) => ({
      id: g.id,
      school_id: g.school_id,
      group_name: g.group_name?.trim(),
      group_image: g.group_image,
      created_by: g.created_by,
    }));

    await this.groupRepo
      .createQueryBuilder()
      .insert()
      .into(ChatGroup)
      .values(values)
      .orUpdate(['group_name', 'group_image'], ['id'])
      .execute();
  }

  async removeMembers(groupId: number): Promise<void> {
    await this.groupMemberRepo.delete({
      group_id: groupId,
    });
  }

  async upsertMemberBatch(members: ChatGroupMember[]): Promise<void> {
    if (!members.length) return;
    const values: CreateChatGroupMemberDto[] = members.map((m) => ({
      group_id: m.group_id,
      user_id: m.user_id,
      id: m.id,
    }));
    await this.groupMemberRepo
      .createQueryBuilder()
      .insert()
      .into(ChatGroupMember)
      .values(values)
      .orIgnore()
      .execute();
  }

  async findGroupByName(
    group_name: string,
    group_id: number | null = null,
  ): Promise<boolean> {
    const existingGroup = await this.groupRepo.findOne({
      where: {
        group_name: group_name?.trim()?.toLowerCase(),
        deleted_at: IsNull(),
        ...((group_id && { id: Not(group_id) }) as any),
      },
    });

    return !!existingGroup;
  }

  async create(data: CreateChatGroupDto): Promise<IRepositoryGroupResponse> {
    const {
      school_id,
      group_name,
      created_by,
      group_image,
      studentDetails = [],
      staffDetails = [],
    } = data;

    const group = this.groupRepo.create({
      school_id,
      group_name: group_name.trim(),
      group_image,
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

  async groupMessageSeenBatch(payload: {
    group_id: number;
    user_id: number;
    message_id: number;
    conversation_id: number;
  }[]) {
    try {
      await this.groupMessageSeenRepo.save(payload);
    } catch (err) {
      throw err;
    }
  }
  async update(data: UpdateGroupDto): Promise<IRepositoryGroupResponse> {
    const {
      group_id,
      group_name,
      group_image,
      studentDetails = [],
      staffDetails = [],
      created_by,
    } = data;

    const updateData: any = {};
    if (group_name) {
      updateData.group_name = group_name.trim();
    }
    if (group_image !== undefined) {
      updateData.group_image = group_image;
    }

    if (Object.keys(updateData).length > 0) {
      await this.groupRepo.update({ id: group_id }, updateData);
    }

    const existingMembers = await this.groupMemberRepo.find({
      where: { group_id },
    });
    const existingMemberIds = new Set(existingMembers.map((m) => m.user_id));

    const allNewMemberIds = new Set([
      ...studentDetails.map((s) => s.id),
      ...staffDetails.map((s) => s.id),
    ]);

    if (created_by) {
      allNewMemberIds.add(created_by);
    }

    const membersToAdd = Array.from(allNewMemberIds).filter(
      (id) => !existingMemberIds.has(id),
    );

    const membersToRemove = existingMembers
      .filter((m) => !allNewMemberIds.has(m.user_id))
      .map((m) => m.user_id);

    if (membersToAdd.length > 0) {
      const newMembers = membersToAdd.map((userId) => ({
        group_id,
        user_id: userId,
      }));
      await this.groupMemberRepo.save(newMembers);
    }

    if (membersToRemove.length > 0) {
      await this.groupMemberRepo.delete({
        group_id,
        user_id: In(membersToRemove),
      });
    }

    return {
      group_id: group_id!,
    };
  }

  async findById(id: number): Promise<ChatGroup | null> {
    return this.groupRepo.findOne({ where: { id, deleted_at: IsNull() } });
  }

  async findByIdWithGroupMembers(id: number): Promise<ChatGroup | null> {
    const group = await this.groupRepo.findOne({
      where: { id },
      withDeleted: false,
      relations: ['members', 'members.user'],
    });
    return group;
  }

  async getGroupNamesByUserId(
    school_id: number,
    user_id: number,
  ): Promise<ChatGroup[] | null> {
    if (!user_id || !school_id) {
      return null;
    }
    const groups = await this.groupRepo.find({
      where: {
        school_id,
        members: { user_id },
      },
      withDeleted: false,
      relations: ['members', 'members.user'],
    });
    return groups;
  }

  async getGroupList(
    school_id: number,
    user_id: number,
    level: UserType,
  ): Promise<ChatGroup[] | null> {
    if (!user_id || !school_id) {
      return null;
    }
    if (level === UserType.CLIENT) {
      return this.groupRepo.find({
        where: {
          school_id,
        },
        withDeleted: false,
        relations: ['members', 'members.user', 'conversations'],
      });
    }
    const groups = await this.groupRepo.find({
      where: {
        school_id,
        members: { user_id },
      },
      withDeleted: false,
      relations: ['members', 'members.user', 'conversations'],
    });
    return groups;
  }
}
