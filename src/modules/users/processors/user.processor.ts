import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job } from 'bullmq';
import { UserRepository } from '../repositories/user.repository';
import { UserProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { executeWithRetry } from 'src/utils/helpers';

@Processor(UserProcessorConfig.queue_name, {
  concurrency: UserProcessorConfig.no_of_jobs,
  limiter: {
    max: UserProcessorConfig.max_no_of_job_per_second,
    duration: 1000, // per second
  },
})
@Injectable()
export class UserProcessor extends WorkerHost implements OnModuleDestroy {
  // Batch configuration
  private readonly BATCH_SIZE = UserProcessorConfig.batch_size;
  private readonly BATCH_TIMEOUT = UserProcessorConfig.batch_timeout;
  private readonly MAX_DB_RETRIES = UserProcessorConfig.max_db_retries;

  // Batch storage
  private createBatch: CreateUserDto[] = [];
  private updateBatch: Map<string, UpdateUserDto> = new Map();

  private createTimer: NodeJS.Timeout | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  
  private isProcessingCreate = false;
  private isProcessingUpdate = false;

  constructor(private readonly userRepository: UserRepository) {
    super();
  }

  async process(job: Job) {
    const { name, data } = job;

    try {
      switch (name) {
        case 'save-user':
          return await this.batchSaveUser(data);
        case 'update-user':
          return await this.batchUpdateUser(data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      throw error;
    }
  }

  private async batchSaveUser(data: CreateUserDto) {
    this.createBatch.push(data);

    if (this.createBatch.length >= this.BATCH_SIZE) {
      await this.flushCreateBatch();
    } else if (!this.createTimer) {
      this.createTimer = setTimeout(() => this.flushCreateBatch(), this.BATCH_TIMEOUT);
    }

    return { success: true, batched: true, userId: data.id };
  }

  private async flushCreateBatch() {
    if (this.createBatch.length === 0 || this.isProcessingCreate) return;

    const batch = [...this.createBatch];
    this.createBatch = [];

    if (this.createTimer) {
      clearTimeout(this.createTimer);
      this.createTimer = null;
    }

    this.isProcessingCreate = true;

    try {
      await executeWithRetry(async () => {
        await this.userRepository.createBatch(batch);
      });
    } catch (error) {
      for (const user of batch) {
        try {
          await this.userRepository.create(user);
          await this.sleep(100);
        } catch (err) {}
      }
    } finally {
      this.isProcessingCreate = false;
    }
  }

  private async batchUpdateUser(data: UpdateUserDto) {
    if (!data.id) {
      throw new Error('User ID is required for update');
    }

    const existingUpdate = this.updateBatch.get(data.id);

    if (existingUpdate) {
      this.updateBatch.set(data.id, { ...existingUpdate, ...data });
    } else {
      this.updateBatch.set(data.id, data);
    }

    if (this.updateBatch.size >= this.BATCH_SIZE) {
      await this.flushUpdateBatch();
    } else if (!this.updateTimer) {
      this.updateTimer = setTimeout(
        () => this.flushUpdateBatch(),
        this.BATCH_TIMEOUT,
      );
    }

    return { success: true, batched: true, userId: data.id };
  }

  private async flushUpdateBatch() {
    if (this.updateBatch.size === 0 || this.isProcessingUpdate) return;

    const batch = Array.from(this.updateBatch.values());
    this.updateBatch.clear();

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    this.isProcessingUpdate = true;

    try {
      await executeWithRetry(async () => {
        await this.userRepository.updateBatch(batch);
      });

    } catch (error) {
      for (const user of batch) {
        try {
          await this.userRepository.update(user.user_id!, user);
          await this.sleep(100);
        } catch (err) {
        }
      }
    } finally {
      this.isProcessingUpdate = false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy() {
    if (this.createTimer) clearTimeout(this.createTimer);
    if (this.updateTimer) clearTimeout(this.updateTimer);

    await Promise.all([this.flushCreateBatch(), this.flushUpdateBatch()]);
  }
}
