import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateUserDto } from '../dto/create-user.dto';
import { User } from '../entities/user.entity';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
@Injectable()
export class UserService {
  constructor(
    @InjectQueue(UserProcessorConfig.queue_name) private userQueue: Queue,
  ) {}

  async createUser(payload: CreateUserDto): Promise<User> {
    const data: Partial<User> = {
      id: payload.id,
      name: payload.name,
      type: payload.type,
      image: payload.image,
      user_id: payload.user_id,
      school_id: payload.school_id,
    };
    await this.userQueue.add('save-user', data);
    return { ...data } as User;
  }

  async createUsers(payload: CreateUserDto[]): Promise<User[]> {
    const payloads = payload.map((create) => ({
      name: create.name,
      type: create.type,
      image: create.image,
      user_id: create.user_id,
      school_id: create.school_id,
      id: create.id,
    }));
    const jobs = payloads.map((data) => ({
      name: 'save-user',
      data,
    }));

    await this.userQueue.addBulk(jobs);
    return payloads as User[];
  }

  async updateUser(payload: UpdateUserDto): Promise<User> {
    const data: Partial<User> = {
      id: payload?.id,
      name: payload.name,
      type: payload.type,
      image: payload.image,
      user_id: payload.user_id,
      school_id: payload.school_id,
    };

    await this.userQueue.add('update-user', data, {
      priority: 4,
      jobId: `update-user-${payload.user_id}`,
    });

    return { ...data } as User;
  }

  async updateUsers(updates: Array<User>): Promise<User[]> {
    const payloads = updates?.map((update) => ({
      name: update?.name,
      type: update?.type,
      image: update?.image,
      user_id: update?.user_id,
      school_id: update?.school_id,
      id: update?.id,
    }));

    const jobs = updates.map((update) => ({
      name: 'update-user',
      data: update,
    }));

    await this.userQueue.addBulk(jobs);

    return payloads as User[];
  }
}
