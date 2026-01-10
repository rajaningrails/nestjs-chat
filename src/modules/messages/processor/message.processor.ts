import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { MessageProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { Redis } from 'ioredis';
import { MessageRepository } from '../repositories/message.repository';
import { MessageDto } from '../dto/message.dto';

@Processor(MessageProcessorConfig.queue_name, {
  concurrency: MessageProcessorConfig.no_of_jobs,
  limiter: {
    max: MessageProcessorConfig.max_no_of_job_per_second,
    duration: 1000,
  },
})
@Injectable()
export class MessageProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MessageProcessor.name);

  private readonly CREATE_BUFFER_KEY = 'buffer:message:create';
  private readonly DELETE_BUFFER_KEY = 'buffer:message:create';
  private readonly UPDATE_BUFFER_KEY = 'buffer:message:update';
  private readonly USER_SEEN_BUFFER_KEY = 'buffer:message:user-seen';
  private readonly CREATE_LOCK_KEY = 'lock:message:create:flush';
  private readonly UPDATE_LOCK_KEY = 'lock:message:update:flush';
  private readonly DELETE_LOCK_KEY = 'lock:message:delete:flush';
  private readonly USER_SEEN_LOCK_KEY = 'lock:message:user-seen:flush';

  private readonly BATCH_SIZE = MessageProcessorConfig.batch_size || 100;
  private readonly FLUSH_INTERVAL =
    MessageProcessorConfig.batch_timeout ?? 5000;
  private readonly LOCK_TTL = 30000; // 30 seconds

  private flushInterval: NodeJS.Timeout | null = null;
  private redis: Redis;

  constructor(
    @InjectQueue(MessageProcessorConfig.queue_name) private messageQueue: Queue,
    private readonly messageRepository: MessageRepository,
  ) {
    super();
  }

  async onModuleInit() {
    this.redis = (await this.messageQueue.client) as Redis;

    this.flushInterval = setInterval(async () => {
      try {
        await Promise.all([
          this.flushCreateBuffer(),
          this.flushUpdateBuffer(),
          this.flushDeleteBuffer(),
          this.flushUserMessageSeen(),
        ]);
      } catch (error) {
        this.logger.error('Periodic flush failed', error);
      }
    }, this.FLUSH_INTERVAL);

    this.logger.log('Message Processor initialized with Redis batching');
  }

  async process(job: Job) {
    const { name, data } = job;

    try {
      switch (name) {
        case 'save-message':
          return await this.bufferCreate(data);
        case 'update-message':
          return await this.bufferUpdate(data);
        case 'delete-message':
          return await this.bufferDelete(data);
        case 'one-to-one-seen':
          return await this.bufferOneToOneSeen(data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${name} failed`, error);
      throw error;
    }
  }

  private async bufferCreate(data: MessageDto) {
    await this.redis.lpush(this.CREATE_BUFFER_KEY, JSON.stringify(data));

    const count = await this.redis.llen(this.CREATE_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      this.flushCreateBuffer().catch((err) =>
        this.logger.error('Async flush failed', err),
      );
    }

    return { success: true, buffered: true, operation: 'create' };
  }

  private async bufferUpdate(data: Partial<MessageDto>) {
    if (!data.id) {
      throw new Error('message id is required for updates');
    }

    await this.redis.hset(
      this.UPDATE_BUFFER_KEY,
      data.id.toString(),
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
        await this.messageRepository.upsertBatch(batch);
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
        await this.messageRepository.upsertBatch(batch);
      } catch (error) {
        await this.moveToDLQ('update', batch, error);
      }
    } finally {
      await this.redis.del(this.UPDATE_LOCK_KEY);
    }
  }

  private async bufferDelete(data: { id: number | string }) {
    if (!data.id) {
      throw new Error('message id is required for deletes');
    }

    await this.redis.sadd(this.DELETE_BUFFER_KEY, data.id.toString());

    const count = await this.redis.scard(this.DELETE_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      this.flushDeleteBuffer().catch((err) =>
        this.logger.error('Async delete flush failed', err),
      );
    }

    return { success: true, buffered: true, operation: 'delete' };
  }

  private async flushDeleteBuffer() {
    const lockAcquired = await this.redis.set(
      this.DELETE_LOCK_KEY,
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
        .smembers(this.DELETE_BUFFER_KEY)
        .del(this.DELETE_BUFFER_KEY)
        .exec();

      const ids = result?.[0]?.[1] as string[];

      if (!ids || ids.length === 0) {
        return;
      }

      try {
        await this.messageRepository.deleteBatch(ids);
      } catch (error) {
        await this.moveToDLQ('delete', ids, error);
      }
    } finally {
      await this.redis.del(this.DELETE_LOCK_KEY);
    }
  }

  private async bufferOneToOneSeen(data: { id: number | string }) {
    if (!data.id) {
      throw new Error('message id is required for seen');
    }

    await this.redis.sadd(this.USER_SEEN_BUFFER_KEY, data.id.toString());

    const count = await this.redis.scard(this.USER_SEEN_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      this.flushUserMessageSeen().catch((err) =>
        this.logger.error('Async seen flush failed', err),
      );
    }

    return { success: true, buffered: true, operation: 'one-to-one-seen' };
  }

  private async flushUserMessageSeen() {
    const lockAcquired = await this.redis.set(
      this.USER_SEEN_LOCK_KEY,
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
        .smembers(this.USER_SEEN_BUFFER_KEY)
        .del(this.USER_SEEN_BUFFER_KEY)
        .exec();

      const ids = result?.[0]?.[1] as string[];

      if (!ids || ids.length === 0) {
        return;
      }

      try {
        await this.messageRepository.oneToOneChatMessageSeenBatch(ids);
      } catch (error) {
        await this.moveToDLQ('one-to-one-seen', ids, error);
      }
    } finally {
      await this.redis.del(this.USER_SEEN_LOCK_KEY);
    }
  }

  private async moveToDLQ(
    operation:
      | 'create'
      | 'update'
      | 'delete'
      | 'one-to-one-seen'
      | 'group-seen',
    data: any[],
    error: any,
  ) {
    const dlqKey = `dlq:message:${operation}`;

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

    await Promise.all([
      this.flushCreateBuffer(),
      this.flushUpdateBuffer(),
      this.flushDeleteBuffer(),
      this.flushUserMessageSeen(),
    ]);
  }
}
