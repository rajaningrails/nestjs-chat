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
import { SendMessageDto } from '../dto/send-message.dto';
import { GroupRepository } from 'src/modules/group/repositories/group.repository';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';

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
  
  // Buffer keys
  private readonly CREATE_BUFFER_KEY = 'buffer:message:create';
  private readonly DELETE_BUFFER_KEY = 'buffer:message:delete';
  private readonly UPDATE_BUFFER_KEY = 'buffer:message:update';
  private readonly USER_SEEN_BUFFER_KEY = 'buffer:message:user-seen';
  private readonly GROUP_SEEN_BUFFER_KEY = 'buffer:group-message-seen:create';
  private readonly CONVERSATION_UPDATE_BUFFER_KEY = 'buffer:conversation:update';
  
  // Lock keys
  private readonly CREATE_LOCK_KEY = 'lock:message:create:flush';
  private readonly UPDATE_LOCK_KEY = 'lock:message:update:flush';
  private readonly DELETE_LOCK_KEY = 'lock:message:delete:flush';
  private readonly USER_SEEN_LOCK_KEY = 'lock:message:user-seen:flush';
  private readonly GROUP_SEEN_LOCK_KEY = 'lock:member:group-message-seen:flush';
  private readonly CONVERSATION_UPDATE_LOCK_KEY = 'lock:conversation:update:flush';
  
  private readonly BATCH_SIZE = MessageProcessorConfig.batch_size || 100;
  private readonly FLUSH_INTERVAL = MessageProcessorConfig.batch_timeout ?? 5000;
  private readonly LOCK_TTL = 30000;
  
  private flushInterval: NodeJS.Timeout | null = null;
  private redis: Redis;
  private isShuttingDown = false;

  constructor(
    @InjectQueue(MessageProcessorConfig.queue_name) private messageQueue: Queue,
    private readonly messageRepository: MessageRepository,
    private readonly groupRepository: GroupRepository,
    private readonly conversationRepository: ConversationRepository,
  ) {
    super();
  }

  async onModuleInit() {
    this.redis = (await this.messageQueue.client) as Redis;
    
    this.flushInterval = setInterval(async () => {
      if (this.isShuttingDown) return;
      
      try {
        const [createLen, updateLen, deleteLen, userSeenLen, conversationUpdateLen] = await Promise.all([
          this.redis.llen(this.CREATE_BUFFER_KEY),
          this.redis.hlen(this.UPDATE_BUFFER_KEY),
          this.redis.scard(this.DELETE_BUFFER_KEY),
          this.redis.scard(this.USER_SEEN_BUFFER_KEY),
          this.redis.hlen(this.CONVERSATION_UPDATE_BUFFER_KEY),
        ]);

        const flushPromises: Promise<void>[] = [];
        
        // CRITICAL: Flush messages BEFORE conversations to avoid FK constraint violations
        if (createLen > 0) flushPromises.push(this.flushCreateBuffer());
        if (updateLen > 0) flushPromises.push(this.flushUpdateBuffer());
        if (deleteLen > 0) flushPromises.push(this.flushDeleteBuffer());
        if (userSeenLen > 0) flushPromises.push(this.flushUserMessageSeen());
        
        // Wait for message operations to complete first
        if (flushPromises.length > 0) {
          await Promise.all(flushPromises);
        }
        
        // Then flush conversation updates after messages are committed
        if (conversationUpdateLen > 0) {
          await this.flushConversationUpdateBuffer();
        }
      } catch (error) {
        this.logger.error('Periodic flush failed', error);
      }
    }, this.FLUSH_INTERVAL);
    
    this.logger.log('Message Processor initialized with Redis batching');
  }

  async process(job: Job) {
    const { name, data } = job;
    
    try {
      if (!data) {
        throw new Error(`Job ${name} has no data`);
      }

      switch (name) {
        case 'save-message':
          return await this.bufferCreate(data);
        case 'update-message':
          return await this.bufferUpdate(data);
        case 'delete-message':
          return await this.bufferDelete(data);
        case 'one-to-one-seen':
          return await this.bufferOneToOneSeen(data);
        case 'group-message-seen':
          return await this.bufferGroupSeen(data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${name} failed`, error);
      throw error;
    }
  }

  private async bufferCreate(data: MessageDto) {
    if (!data) {
      throw new Error('Message data is required for create');
    }

    // Buffer the message
    await this.redis.lpush(this.CREATE_BUFFER_KEY, JSON.stringify(data));
    
    // Buffer conversation update if conversation_id exists
    if (data.conversation_id) {
      const conversationUpdate = {
        id: data.conversation_id,
        last_message_id: data.id,
        last_message_sender_id: data.sender_id,
        last_message_receiver_id: data.receiver_id,
        updated_at: new Date(),
      };
      
      await this.redis.hset(
        this.CONVERSATION_UPDATE_BUFFER_KEY,
        data.conversation_id.toString(),
        JSON.stringify(conversationUpdate),
      );
    }
    
    const count = await this.redis.llen(this.CREATE_BUFFER_KEY);
    
    if (count >= this.BATCH_SIZE) {
      setImmediate(async () => {
        try {
          // CRITICAL: Flush messages first, then conversations
          await this.flushCreateBuffer();
          await this.flushConversationUpdateBuffer();
        } catch (err) {
          this.logger.error('Async flush failed', err);
        }
      });
    }
    
    return { success: true, buffered: true, operation: 'create' };
  }

  private async bufferUpdate(data: Partial<MessageDto>) {
    if (!data?.id) {
      throw new Error('Message id is required for updates');
    }

    await this.redis.hset(
      this.UPDATE_BUFFER_KEY,
      data.id.toString(),
      JSON.stringify(data),
    );
    
    const count = await this.redis.hlen(this.UPDATE_BUFFER_KEY);
    
    if (count >= this.BATCH_SIZE) {
      setImmediate(() => {
        this.flushUpdateBuffer().catch((err) =>
          this.logger.error('Async update flush failed', err),
        );
      });
    }
    
    return { success: true, buffered: true, operation: 'update' };
  }

  private async bufferDelete(data: { id: number | string }) {
    if (!data?.id) {
      throw new Error('Message id is required for deletes');
    }

    await this.redis.sadd(this.DELETE_BUFFER_KEY, data.id.toString());
    const count = await this.redis.scard(this.DELETE_BUFFER_KEY);
    
    if (count >= this.BATCH_SIZE) {
      setImmediate(() => {
        this.flushDeleteBuffer().catch((err) =>
          this.logger.error('Async delete flush failed', err),
        );
      });
    }
    
    return { success: true, buffered: true, operation: 'delete' };
  }

  private async bufferOneToOneSeen(data: { id: number | string }) {
    if (!data?.id) {
      throw new Error('Message id is required for seen');
    }

    await this.redis.sadd(this.USER_SEEN_BUFFER_KEY, data.id.toString());
    const count = await this.redis.scard(this.USER_SEEN_BUFFER_KEY);
    
    if (count >= this.BATCH_SIZE) {
      setImmediate(() => {
        this.flushUserMessageSeen().catch((err) =>
          this.logger.error('Async seen flush failed', err),
        );
      });
    }
    
    return { success: true, buffered: true, operation: 'one-to-one-seen' };
  }

  private async bufferGroupSeen(data: SendMessageDto) {
    await this.redis.lpush(this.GROUP_SEEN_BUFFER_KEY, JSON.stringify(data));

    const count = await this.redis.llen(this.GROUP_SEEN_BUFFER_KEY);

    if (count >= this.BATCH_SIZE) {
      this.flushGroupMessageSeen().catch((err) =>
        this.logger.error('Async flush failed', err),
      );
    }

    return { success: true, buffered: true, operation: 'group-seen' };
  }

  private async flushGroupMessageSeen() {
    const lockAcquired = await this.redis.set(
      this.GROUP_SEEN_LOCK_KEY,
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
        .lrange(this.GROUP_SEEN_BUFFER_KEY, 0, -1)
        .del(this.GROUP_SEEN_BUFFER_KEY)
        .exec();

      const rawData = result?.[0]?.[1] as string[];

      if (!rawData || rawData.length === 0) {
        return;
      }

      const batch = rawData.map((item) => JSON.parse(item));
      try {
        await this.groupRepository.groupMessageSeenBatch(batch);
      } catch (error) {
        await this.moveToDLQ('group-seen', batch, error);
      }
    } finally {
      await this.redis.del(this.GROUP_SEEN_LOCK_KEY);
    }
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
      this.logger.debug('Create flush already in progress, skipping');
      return;
    }

    const startTime = Date.now();
    
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

      this.logger.log(`Flushing ${rawData.length} create operations`);

      if (rawData.length > this.BATCH_SIZE * 2) {
        await this.extendLock(this.CREATE_LOCK_KEY, this.LOCK_TTL);
      }

      const batch = rawData.map((item) => {
        try {
          return JSON.parse(item);
        } catch (error) {
          this.logger.error('Failed to parse message data', { item, error });
          return null;
        }
      }).filter(Boolean);

      if (batch.length === 0) {
        return;
      }

      try {
        await this.messageRepository.upsertBatch(batch);
        this.logger.log(`Successfully flushed ${batch.length} create operations in ${Date.now() - startTime}ms`);
      } catch (error) {
        this.logger.error('Create batch upsert failed, moving to DLQ', error);
        await this.moveToDLQ('create', batch, error);
        
        // If messages failed, clear conversation updates to prevent FK violations
        await this.clearRelatedConversationUpdates(batch);
      }
    } catch (error) {
      this.logger.error('Create flush operation failed', error);
      throw error;
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
      this.logger.debug('Update flush already in progress, skipping');
      return;
    }

    const startTime = Date.now();

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

      const dataCount = Object.keys(hashData).length;
      this.logger.log(`Flushing ${dataCount} update operations`);

      if (dataCount > this.BATCH_SIZE * 2) {
        await this.extendLock(this.UPDATE_LOCK_KEY, this.LOCK_TTL);
      }

      const batch = Object.values(hashData).map((item) => {
        try {
          return JSON.parse(item);
        } catch (error) {
          this.logger.error('Failed to parse update data', { item, error });
          return null;
        }
      }).filter(Boolean);

      if (batch.length === 0) {
        return;
      }

      try {
        await this.messageRepository.upsertBatch(batch);
        this.logger.log(`Successfully flushed ${batch.length} update operations in ${Date.now() - startTime}ms`);
      } catch (error) {
        this.logger.error('Update batch upsert failed, moving to DLQ', error);
        await this.moveToDLQ('update', batch, error);
      }
    } catch (error) {
      this.logger.error('Update flush operation failed', error);
      throw error;
    } finally {
      await this.redis.del(this.UPDATE_LOCK_KEY);
    }
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
      this.logger.debug('Delete flush already in progress, skipping');
      return;
    }

    const startTime = Date.now();

    try {
      const result = await this.redis
        .multi()
        .smembers(this.DELETE_BUFFER_KEY)
        .del(this.DELETE_BUFFER_KEY)
        .exec();

      const ids = result?.[0]?.[1] as number[];
      
      if (!ids || ids.length === 0) {
        return;
      }

      this.logger.log(`Flushing ${ids.length} delete operations`);

      if (ids.length > this.BATCH_SIZE * 2) {
        await this.extendLock(this.DELETE_LOCK_KEY, this.LOCK_TTL);
      }

      try {
        await this.messageRepository.deleteBatch(ids);
        this.logger.log(`Successfully flushed ${ids.length} delete operations in ${Date.now() - startTime}ms`);
      } catch (error) {
        this.logger.error('Delete batch operation failed, moving to DLQ', error);
        await this.moveToDLQ('delete', ids, error);
      }
    } catch (error) {
      this.logger.error('Delete flush operation failed', error);
      throw error;
    } finally {
      await this.redis.del(this.DELETE_LOCK_KEY);
    }
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
      this.logger.debug('User seen flush already in progress, skipping');
      return;
    }

    const startTime = Date.now();

    try {
      const result = await this.redis
        .multi()
        .smembers(this.USER_SEEN_BUFFER_KEY)
        .del(this.USER_SEEN_BUFFER_KEY)
        .exec();

      const ids = result?.[0]?.[1] as number[];
      
      if (!ids || ids.length === 0) {
        return;
      }

      this.logger.log(`Flushing ${ids.length} user seen operations`);

      if (ids.length > this.BATCH_SIZE * 2) {
        await this.extendLock(this.USER_SEEN_LOCK_KEY, this.LOCK_TTL);
      }

      try {
        await this.messageRepository.oneToOneChatMessageSeenBatch(ids);
        this.logger.log(`Successfully flushed ${ids.length} user seen operations in ${Date.now() - startTime}ms`);
      } catch (error) {
        this.logger.error('User seen batch operation failed, moving to DLQ', error);
        await this.moveToDLQ('one-to-one-seen', ids, error);
      }
    } catch (error) {
      this.logger.error('User seen flush operation failed', error);
      throw error;
    } finally {
      await this.redis.del(this.USER_SEEN_LOCK_KEY);
    }
  }

  /**
   * CRITICAL: This must be called AFTER messages are successfully committed
   * to avoid FK constraint violations on last_message_id
   */
  private async flushConversationUpdateBuffer() {
    const lockAcquired = await this.redis.set(
      this.CONVERSATION_UPDATE_LOCK_KEY,
      Date.now().toString(),
      'PX',
      this.LOCK_TTL,
      'NX',
    );

    if (!lockAcquired) {
      this.logger.debug('Conversation update flush already in progress, skipping');
      return;
    }

    const startTime = Date.now();

    try {
      const result = await this.redis
        .multi()
        .hgetall(this.CONVERSATION_UPDATE_BUFFER_KEY)
        .del(this.CONVERSATION_UPDATE_BUFFER_KEY)
        .exec();

      const hashData = result?.[0]?.[1] as Record<string, string>;
      
      if (!hashData || Object.keys(hashData).length === 0) {
        return;
      }

      const dataCount = Object.keys(hashData).length;
      this.logger.log(`Flushing ${dataCount} conversation update operations`);

      if (dataCount > this.BATCH_SIZE * 2) {
        await this.extendLock(this.CONVERSATION_UPDATE_LOCK_KEY, this.LOCK_TTL);
      }

      const batch = Object.values(hashData).map((item) => {
        try {
          return JSON.parse(item);
        } catch (error) {
          this.logger.error('Failed to parse conversation update data', { item, error });
          return null;
        }
      }).filter(Boolean);

      if (batch.length === 0) {
        return;
      }

      try {
        await this.conversationRepository.upsertBatch(batch);
        this.logger.log(`Successfully flushed ${batch.length} conversation updates in ${Date.now() - startTime}ms`);
      } catch (error) {
        this.logger.error('Conversation update batch failed, moving to DLQ', error);
        await this.moveToDLQ('conversation-update', batch, error);
      }
    } catch (error) {
      this.logger.error('Conversation update flush operation failed', error);
      throw error;
    } finally {
      await this.redis.del(this.CONVERSATION_UPDATE_LOCK_KEY);
    }
  }

  /**
   * Clear conversation updates for failed message batches to prevent FK violations
   */
  private async clearRelatedConversationUpdates(failedMessages: MessageDto[]) {
    try {
      const conversationIds = failedMessages
        .map(msg => msg.conversation_id?.toString())
        .filter(Boolean);
      
      if (conversationIds.length > 0) {
        await this.redis.hdel(this.CONVERSATION_UPDATE_BUFFER_KEY, ...conversationIds);
        this.logger.warn(`Cleared ${conversationIds.length} conversation updates due to message flush failure`);
      }
    } catch (error) {
      this.logger.error('Failed to clear conversation updates', error);
    }
  }

  private async extendLock(lockKey: string, ttl: number): Promise<void> {
    try {
      await this.redis.pexpire(lockKey, ttl);
      this.logger.debug(`Extended lock ${lockKey} by ${ttl}ms`);
    } catch (error) {
      this.logger.warn(`Failed to extend lock ${lockKey}`, error);
    }
  }

  private async moveToDLQ(
    operation: 'create' | 'update' | 'delete' | 'one-to-one-seen' | 'group-seen' | 'conversation-update',
    data: any[],
    error: any,
  ) {
    try {
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
      await this.redis.ltrim(dlqKey, 0, 999);
      
      this.logger.warn(`Moved ${data.length} items to DLQ: ${dlqKey}`);
    } catch (dlqError) {
      this.logger.error('Failed to move items to DLQ', dlqError);
    }
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.logger.log('Stopped periodic flush interval');
    }

    this.logger.log('Flushing all buffers before shutdown...');
    
    try {
      // CRITICAL: Flush messages first, then conversations
      await Promise.all([
        this.flushCreateBuffer(),
        this.flushUpdateBuffer(),
        this.flushDeleteBuffer(),
        this.flushUserMessageSeen(),
      ]);
      
      // Then flush conversation updates after messages are committed
      await this.flushConversationUpdateBuffer();
      
      this.logger.log('All buffers flushed successfully');
    } catch (error) {
      this.logger.error('Error during final flush', error);
    }
  }
}