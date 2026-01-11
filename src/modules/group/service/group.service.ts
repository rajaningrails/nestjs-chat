import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GroupProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { CreateChatGroupDto, UpdateGroupDto } from '../dto/chat-group.dto';
import { CreateChatGroupMemberDto } from '../dto/chat-group-member.dto';
@Injectable()
export class GroupService {
  constructor(
    @InjectQueue(GroupProcessorConfig.queue_name) private groupQueue: Queue,
  ) {}

  async createGroup(payload: CreateChatGroupDto) {
    const data: CreateChatGroupDto = {
      ...payload,
    };

    await this.groupQueue.add('save-group', data, {
      jobId: `create-group-${payload.id}`,
    });

    return {
      id: payload.id,
      group_name: payload.group_name,
      group_image: payload.group_image,
      created_by: payload.created_by,
      school_id: payload.school_id,
    };
  }

  async createGroups(payload: CreateChatGroupDto[]) {
    const payloads = payload.map((p) => ({
      ...p,
    }));

    const jobs = payloads.map((data) => ({
      name: 'save-group',
      data,
      opts: { jobId: `create-group-${data.id}` },
    }));

    await this.groupQueue.addBulk(jobs);
    return payloads.map(
      ({ id, group_name, group_image, created_by, school_id }) => ({
        id,
        group_name,
        group_image,
        created_by,
        school_id,
      }),
    );
  }

  async createGroupMembers(payload: CreateChatGroupMemberDto[]) {
    const data: CreateChatGroupMemberDto[] = payload;
    await this.groupQueue.add('save-member', data);
    return data;
  }

  async updateGroupMembers(payload: Partial<CreateChatGroupMemberDto>[]) {
    const data: Partial<CreateChatGroupMemberDto>[] = payload;
    await this.groupQueue.add('update-member', data);
    return data;
  }

  async updateGroup(payload: UpdateGroupDto) {
    await this.groupQueue.add('update-group', payload, {
      jobId: `update-group-${payload.group_id}`,
    });

    return payload;
  }

  async updateGroups(updates: UpdateGroupDto[]) {
    const jobs = updates.map((update) => ({
      name: 'update-group',
      data: update,
      opts: { jobId: `update-group-${update.group_id}` },
    }));

    await this.groupQueue.addBulk(jobs);
    return updates;
  }
}
