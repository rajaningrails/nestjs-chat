import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { GroupProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { Redis } from 'ioredis';
import { GroupRepository } from '../repositories/group.repository';
import { CreateChatGroupDto, UpdateGroupDto } from '../dto/chat-group.dto';

@Processor(GroupProcessorConfig.queue_name, {
  concurrency: GroupProcessorConfig.no_of_jobs,
  limiter: {
    max: GroupProcessorConfig.max_no_of_job_per_second,
    duration: 1000,
  },
})
@Injectable()
export class GroupProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GroupProcessor.name);

  private readonly CREATE_BUFFER_KEY = 'buffer:group:create';
  private readonly UPDATE_BUFFER_KEY = 'buffer:group:update';
  private readonly CREATE_LOCK_KEY = 'lock:group:create:flush';
  private readonly UPDATE_LOCK_KEY = 'lock:group:update:flush';

  private readonly BATCH_SIZE = GroupProcessorConfig.batch_size || 100;
  private readonly FLUSH_INTERVAL = GroupProcessorConfig.batch_timeout || 5000;
  private readonly LOCK_TTL = 30000;

  private flushInterval: NodeJS.Timeout | null = null;
  private redis: Redis;

  constructor(
    @InjectQueue(GroupProcessorConfig.queue_name) private groupQueue: Queue,
    private readonly groupRepository: GroupRepository,
  ) {
    super();
  }

  async onModuleInit() {
    this.redis = (await this.groupQueue.client) as Redis;

    this.flushInterval = setInterval(async () => {
      try {
        await Promise.all([this.flushCreateBuffer(), this.flushUpdateBuffer()]);
      } catch (error) {
        this.logger.error('Periodic flush failed', error);
      }
    }, this.FLUSH_INTERVAL);

    this.logger.log('GroupProcessor initialized with Redis batching');
  }

  async process(job: Job) {
    const { name, data } = job;

    try {
      switch (name) {
        case 'save-group':
          return await this.bufferCreate(data);
        case 'update-group':
          return await this.bufferUpdate(data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${name} failed`, error);
      throw error;
    }
  }

  private async bufferCreate(data: CreateChatGroupDto) {
    await this.redis.lpush(this.CREATE_BUFFER_KEY, JSON.stringify(data));

    const count = await this.redis.llen(this.CREATE_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      this.flushCreateBuffer().catch((err) =>
        this.logger.error('Async flush failed', err),
      );
    }

    return { success: true, buffered: true, operation: 'create' };
  }

  private async bufferUpdate(data: UpdateGroupDto) {
    if (!data.group_id) {
      throw new Error('group id is required for updates');
    }

    await this.redis.hset(
      this.UPDATE_BUFFER_KEY,
      data.group_id.toString(),
      JSON.stringify(data),
    );

    const count = await this.redis.hlen(this.UPDATE_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      this.flushUpdateBuffer().catch((err) =>
        this.logger.error('Async update flush failed', err),
      );
    }

    return { success: true, buffered: true, operation: 'update' };
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
        await this.groupRepository.upsertBatch(batch);
      } catch (error) {
        await this.moveToDLQ('create', batch, error);
      }
    } finally {
      await this.redis.del(this.CREATE_LOCK_KEY);
    }
  }

  private async flushUpdateBuffer() {
    const lockAcquired = await this.redis.set(
      this.UPDATE_LOCK_KEY,
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
        .hgetall(this.UPDATE_BUFFER_KEY)
        .del(this.UPDATE_BUFFER_KEY)
        .exec();

      const hashData = result?.[0]?.[1] as Record<string, string>;

      if (!hashData || Object.keys(hashData).length === 0) {
        return;
      }

      const batch = Object.values(hashData).map((item) => JSON.parse(item));

      try {
        await this.groupRepository.upsertBatch(batch);
      } catch (error) {
        await this.moveToDLQ('update', batch, error);
      }
    } finally {
      await this.redis.del(this.UPDATE_LOCK_KEY);
    }
  }

  private async moveToDLQ(
    operation: 'create' | 'update',
    data: any[],
    error: any,
  ) {
    const dlqKey = `dlq:group:${operation}`;

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

    await Promise.all([this.flushCreateBuffer(), this.flushUpdateBuffer()]);
  }
}
