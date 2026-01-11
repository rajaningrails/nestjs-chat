import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { GroupMemberMessageSeenProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { Redis } from 'ioredis';
import { GroupRepository } from '../repositories/group.repository';
import { CreateChatGroupMemberDto } from '../dto/chat-group-member.dto';

@Processor(GroupMemberMessageSeenProcessorConfig.queue_name, {
  concurrency: GroupMemberMessageSeenProcessorConfig.no_of_jobs,
  limiter: {
    max: GroupMemberMessageSeenProcessorConfig.max_no_of_job_per_second,
    duration: 1000,
  },
})
@Injectable()
export class GroupMessageSeenProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GroupMessageSeenProcessor.name);

  private readonly CREATE_BUFFER_KEY = 'buffer:group-message-seen:create';
  private readonly CREATE_LOCK_KEY = 'lock:member:group-message-seen:flush';

  private readonly BATCH_SIZE = GroupMemberMessageSeenProcessorConfig.batch_size || 100;
  private readonly FLUSH_INTERVAL =
    GroupMemberMessageSeenProcessorConfig.batch_timeout || 5000;
  private readonly LOCK_TTL = 30000; // 30 seconds

  private flushInterval: NodeJS.Timeout | null = null;
  private redis: Redis;

  constructor(
    @InjectQueue(GroupMemberMessageSeenProcessorConfig.queue_name)
    private messageSeenQueue: Queue,
    private readonly groupRepository: GroupRepository,
  ) {
    super();
  }

  async onModuleInit() {
    this.redis = (await this.messageSeenQueue.client) as Redis;

    this.flushInterval = setInterval(async () => {
      try {
        await Promise.all([this.flushCreateBuffer()]);
      } catch (error) {
        this.logger.error('Periodic flush failed', error);
      }
    }, this.FLUSH_INTERVAL);

    this.logger.log('Group member processor initialized with Redis batching');
  }

  async process(job: Job) {
    const { name, data } = job;

    try {
      switch (name) {
        case 'group-member-seen':
          return await this.bufferCreate(data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${name} failed`, error);
      throw error;
    }
  }

  private async bufferCreate(data: CreateChatGroupMemberDto) {
    await this.redis.lpush(this.CREATE_BUFFER_KEY, JSON.stringify(data));

    const count = await this.redis.llen(this.CREATE_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      this.flushCreateBuffer().catch((err) =>
        this.logger.error('Async flush failed', err),
      );
    }

    return { success: true, buffered: true, operation: 'create' };
  }

  private async flushCreateBuffer() {
    const lockAcquired = await this.redis.set(
      this.CREATE_LOCK_KEY,
      Date.now().toString(),
      'PX',
      this.LOCK_TTL,
      'NX',
    );

    if (!lockAcquired) {
      return;
    }

    try {
      const result = await this.redis
        .multi()
        .lrange(this.CREATE_BUFFER_KEY, 0, -1)
        .del(this.CREATE_BUFFER_KEY)
        .exec();

      const rawData = result?.[0]?.[1] as string[];

      if (!rawData || rawData.length === 0) {
        return;
      }

      const batch = rawData.map((item) => JSON.parse(item));
      try {
        await this.groupRepository.groupMessageSeenBatch(batch);
      } catch (error) {
        await this.moveToDLQ('create', batch, error);
      }
    } finally {
      await this.redis.del(this.CREATE_LOCK_KEY);
    }
  }

  private async moveToDLQ(
    operation: 'create',
    data: any[],
    error: any,
  ) {
    const dlqKey = `dlq:group-message-seen:${operation}`;

    const entry = {
      operation,
      failedAt: new Date().toISOString(),
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      dataCount: data.length,
      data,
    };

    await this.redis.lpush(dlqKey, JSON.stringify(entry));
  }

  async onModuleDestroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    await Promise.all([this.flushCreateBuffer()]);
  }
}
