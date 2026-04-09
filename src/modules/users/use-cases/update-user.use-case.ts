import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { User } from '../entities/user.entity';
import type { IUserRepository } from '../repositories/user.repository.interface';
import { IUserRepositoryToken } from '../repositories/user.repository.interface';
import { Queue } from 'bullmq';
import { MessageProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { InjectQueue } from '@nestjs/bullmq';
import { SyncUserDto } from '../dto/sync-user.dto';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @InjectQueue(MessageProcessorConfig.queue_name) private messageQueue: Queue,
  ) {}

  async execute(request: SyncUserDto): Promise<User | null> {
    const existingUser = await this.userRepository.findByUserId(
      request.app_user_id!,
    );
    if (!existingUser) {
      throw new ConflictException('User does not exists');
    }
    await this.messageQueue.add(
      'user-sync',
      {
        ...existingUser,
        name: request.name,
        image: request.image,
        type: request.type,
        school_id: request.app_id,
        user_id: request.app_user_id,
        class: request.class,
        section: request.section,
      },
      {
        priority: 3,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
    return existingUser;
  }
}
