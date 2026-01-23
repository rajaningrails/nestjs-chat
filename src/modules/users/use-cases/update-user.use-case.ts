import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { User } from '../entities/user.entity';
import type { IUserRepository } from '../repositories/user.repository.interface';
import { IUserRepositoryToken } from '../repositories/user.repository.interface';
import { UpdateUserDto } from '../dto/update-user.dto';
import { Queue } from 'bullmq';
import { MessageProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @InjectQueue(MessageProcessorConfig.queue_name) private messageQueue: Queue,
  ) {}

  async execute(request: UpdateUserDto): Promise<User | null> {
    const existingUser = await this.userRepository.findByUserId(
      request.user_id!,
    );
    if (!existingUser) {
      throw new ConflictException('User does not exists');
    }
    await this.messageQueue.add(
      'sync-user',
      {
        ...existingUser,
        ...request,
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
