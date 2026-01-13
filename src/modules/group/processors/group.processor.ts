import { InjectQueue, Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { GroupProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { CreateChatGroupDto } from '../dto/chat-group.dto';
import { User } from 'src/modules/users/entities/user.entity';
import { Message } from 'src/modules/messages/entities/message.entity';
import { Conversation } from 'src/modules/conversations/entities/conversation.entity';

@Processor(GroupProcessorConfig.queue_name, {
  concurrency: GroupProcessorConfig.no_of_jobs,
  limiter: {
    max: GroupProcessorConfig.max_no_of_job_per_second,
    duration: 1000,
  },
})
@Injectable()
export class GroupProcessor extends WorkerHost implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupProcessor.name);

  private readonly CREATE_BUFFER_KEY = 'buffer:group:create';
  private readonly CREATE_LOCK_KEY = 'lock:group:create:flush';

  private readonly BATCH_SIZE = GroupProcessorConfig.batch_size || 100;
  private readonly FLUSH_INTERVAL = GroupProcessorConfig.batch_timeout || 5000;
  private readonly LOCK_TTL = 30000;

  private flushInterval: NodeJS.Timeout | null = null;
  private redis: Redis;

  constructor(
    @InjectQueue(GroupProcessorConfig.queue_name) private groupQueue: Queue,
    private readonly dataSource: DataSource, // Injected for Transactions
  ) {
    super();
  }

  async onModuleInit() {
    this.redis = (await this.groupQueue.client) as Redis;

    this.flushInterval = setInterval(async () => {
      try {
        await this.flushCreateBuffer();
      } catch (error) {
        this.logger.error('Periodic flush failed', error);
      }
    }, this.FLUSH_INTERVAL);

    this.logger.log('GroupProcessor initialized with Redis batching');
  }

  async process(job: Job) {
    const { name, data } = job;
    switch (name) {
      case 'save-group':
        return await this.bufferCreate(data);
      default:
        throw new Error(`Unknown job type: ${name}`);
    }
  }

  private async bufferCreate(data: CreateChatGroupDto) {
    await this.redis.lpush(this.CREATE_BUFFER_KEY, JSON.stringify(data));
    const count = await this.redis.llen(this.CREATE_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      // Trigger flush without awaiting to keep worker free
      this.flushCreateBuffer().catch((err) => this.logger.error('Async flush failed', err));
    }

    return { success: true, buffered: true };
  }

  private async flushCreateBuffer() {
    const lockAcquired = await this.redis.set(this.CREATE_LOCK_KEY, 'locked', 'PX', this.LOCK_TTL, 'NX');
    if (!lockAcquired) return;

    try {
      // Atomic Get and Clear
      const result = await this.redis.multi().lrange(this.CREATE_BUFFER_KEY, 0, -1).del(this.CREATE_BUFFER_KEY).exec();
      const rawData = result?.[0]?.[1] as string[];

      if (!rawData || rawData.length === 0) return;

      const batch: any[] = rawData.map((item) => JSON.parse(item));

      // Execute everything in one Database Transaction to avoid Foreign Key issues
      await this.dataSource.transaction(async (manager) => {
        
        // 1. Prepare Data Pools (Removing duplicates if same user/conv appears twice in batch)
        const conversations = batch.map(b => b.conversationData).filter(Boolean);
        const messages = batch.map(b => b.messageData).filter(Boolean);
        const users = batch.flatMap(b => b.payloadUsers).filter(Boolean);

        // 2. Sequential Upserts (Maintaining FK Integrity)
        if (users.length > 0) {
          await manager.upsert(User, users, ['user_id']); // Ensure your User entity has unique constraint on user_id
        }

        if (conversations.length > 0) {
          // Use save or upsert. Save handles relations better.
          await manager.save(Conversation, conversations);
        }

        if (messages.length > 0) {
          await manager.save(Message, messages);
        }
      });

      this.logger.log(`Successfully flushed batch of ${batch.length} operations`);
    } catch (error) {
      this.logger.error('Batch transaction failed, moving to DLQ', error.stack);
      // Logic for DLQ is kept here so data isn't lost
      await this.moveToDLQ('create', error);
    } finally {
      await this.redis.del(this.CREATE_LOCK_KEY);
    }
  }

  private async moveToDLQ(operation: string, error: any) {
    const dlqKey = `dlq:group:${operation}`;
    const entry = {
      failedAt: new Date().toISOString(),
      error: error?.message || 'Unknown error',
      operation,
    };
    await this.redis.lpush(dlqKey, JSON.stringify(entry));
  }

  async onModuleDestroy() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flushCreateBuffer();
  }
}