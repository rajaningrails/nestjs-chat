import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateUserDto } from '../dto/create-user.dto';
import { User } from '../entities/user.entity';
import { v4 as uuidv4 } from 'uuid';
import { UpdateUserDto } from '../dto/update-user.dto';
@Injectable()
export class UserService {
  constructor(@InjectQueue('users') private userQueue: Queue) {}

  async createUser(payload: CreateUserDto): Promise<User> {
    const userID = this.generateUserId();
    const data: Partial<User> = {
      id: userID,
      name: payload.name,
      type: payload.type,
      image: payload.image,
      user_id: payload.user_id,
      school_id: payload.school_id,
    };
    await this.userQueue.add('save-user', data);
    return { ...data, id: userID } as User;
  }

  async createUsers(payload: CreateUserDto[]): Promise<User[]> {
    const payloads = payload.map((create) => ({
      name: create.name,
      type: create.type,
      image: create.image,
      user_id: create.user_id,
      school_id: create.school_id,
      id: this.generateUserId(),
    }));
    const jobs = payloads.map((data) => ({
      name: 'create-user',
      data,
    }));

    await this.userQueue.addBulk(jobs);
    return payloads as User[];
  }

  async updateUser(tableId: string, payload: UpdateUserDto): Promise<User> {
    const data: Partial<User> = {
      id: tableId,
      name: payload.name,
      type: payload.type,
      image: payload.image,
      user_id: payload.user_id,
      school_id: payload.school_id,
    };

    await this.userQueue.add('update-user', data);

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
      data: updates,
    }));

    await this.userQueue.addBulk(jobs);

    return payloads as User[];
  }

  private generateUserId(): string {
    return uuidv4();
  }
}
