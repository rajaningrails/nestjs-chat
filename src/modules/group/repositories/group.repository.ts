import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ChatGroup } from '../entities/chat-group.entity';
import { ChatGroupMember } from '../entities/chat-group-member.entity';
import {
  IGroupRepository,
  IRepositoryGroupResponse,
} from './group.repository.interface';
import {
  CreateChatGroupDto,
  GetGroupNameDto,
  UpdateGroupDto,
} from '../dto/chat-group.dto';
import { UserType } from 'src/modules/users/dto/user-type.enum';
import { CreateChatGroupMemberDto } from '../dto/chat-group-member.dto';
import { GroupMessageSeen } from '../entities/chat-group-message-seen.entity';
import { S3PresignedUrlService } from 'src/common/services/aws.service';

@Injectable()
export class GroupRepository implements IGroupRepository {
  constructor(
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,

    @InjectRepository(ChatGroupMember)
    private readonly groupMemberRepo: Repository<ChatGroupMember>,

    @InjectRepository(GroupMessageSeen)
    private readonly groupMessageSeenRepo: Repository<GroupMessageSeen>,
    private readonly s3Service: S3PresignedUrlService,
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

  async upsertMemberBatch(members: CreateChatGroupMemberDto[]): Promise<void> {
    if (!members.length) return;
    const values: CreateChatGroupMemberDto[] = members.map((m) => ({
      group_id: m.group_id,
      user_id: m.user_id,
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

  async create(data: CreateChatGroupDto): Promise<ChatGroup> {
    const { school_id, group_name, created_by, group_image } = data;

    const group = this.groupRepo.create({
      school_id,
      group_name: group_name.trim(),
      group_image,
      created_by,
    });

    const savedGroup = await this.groupRepo.save(group);
    return savedGroup;
  }

  private async presignGroup(group: ChatGroup): Promise<ChatGroup> {
    const allImageKeys = [
      group.group_image ?? null,
      ...(group.members?.map((m) => m.user?.image ?? null) || []),
    ];

    const [groupImage, ...memberImages] = await Promise.all(
      allImageKeys.map((key) =>
        key ? this.s3Service.generatePresignedUrl(key) : Promise.resolve(null),
      ),
    );

    return {
      ...group,
      group_image: groupImage!,
      members: group.members?.map((member, index) => ({
        ...member,
        user: member.user
          ? { ...member.user, image: memberImages[index]! }
          : member.user,
      })),
    };
  }

  async groupMessageSeenBatch(
    payload: {
      id: number;
      conversation_id: number;
      seen_update_sender_id: number;
      seen_update_receiver_id?: number;
      group_id: number;
    }[],
  ) {
    if (!payload.length) return;

    const values = payload.map((p) => ({
      message_id: p.id,
      conversation_id: p.conversation_id,
      user_id: p.seen_update_sender_id,
      group_id: p.group_id,
    }));
    console.log('executed');
    await this.groupMessageSeenRepo
      .createQueryBuilder()
      .insert()
      .into(GroupMessageSeen)
      .values(values)
      .orUpdate(
        ['conversation_id', 'updated_at'],
        ['group_id', 'user_id', 'message_id'],
      )
      .execute();
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
    if (!group) return null;
    return await this.presignGroup(group);
  }

  async getGroupMembers(groupId: number): Promise<ChatGroupMember[]> {
    return this.groupMemberRepo.find({
      where: { group_id: groupId },
      select: ['user_id'],
    });
  }

  async getGroupNames(payload: GetGroupNameDto): Promise<ChatGroup[] | null> {
    const groups = await this.groupRepo
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.members', 'member')
      .leftJoinAndSelect('member.user', 'user')
      .where('group.school_id = :school_id', { school_id: payload.school_id })
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('m.group_id')
          .from('chat_group_members', 'm')
          .where('m.user_id = :user_id')
          .getQuery();
        return 'group.id IN ' + subQuery;
      })
      .setParameter('user_id', payload.user_id)
      .andWhere('group.deleted_at IS NULL')
      .getMany();
    if (!groups?.length) return groups;
    return Promise.all(groups.map((group) => this.presignGroup(group)));
  }

  async softDelete(conversationId: number): Promise<boolean> {
    try {
      await this.groupRepo.update(conversationId, {
        deleted_at: new Date(),
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async getGroupList(
    school_id: number,
    user_id: number,
    level: UserType,
  ): Promise<any[] | null> {
    if (!user_id || !school_id) {
      return null;
    }

    let groups: ChatGroup[];

    if (level === 'client') {
      groups = await this.groupRepo.find({
        where: { school_id },
        withDeleted: false,
        relations: ['members', 'members.user', 'conversations'],
      });
    } else {
      groups = await this.groupRepo.find({
        where: {
          school_id,
          members: { user_id },
        },
        withDeleted: false,
        relations: ['members', 'members.user', 'conversations'],
      });
    }
    const presigned = await Promise.all(
      groups.map((group) => this.presignGroup(group)),
    );

    return presigned?.map((group) => ({
      ...group,
      group_id: group.id,
      id: group.id,
    }));
  }
}
