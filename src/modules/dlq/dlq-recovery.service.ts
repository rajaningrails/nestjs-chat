import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { ModuleRef } from '@nestjs/core';

interface DLQEntry {
  operation: string;
  failedAt: string;
  error: string;
  stack?: string;
  dataCount: number;
  data: any[];
  retryCount?: number;
}

interface RetryStrategy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

interface EntityConfig {
  repository: string;
  operations: string[];
  retryStrategy: RetryStrategy;
  customRetryLogic?: (repo: any, operation: string, data: any[]) => Promise<boolean>;
}

@Injectable()
export class DLQRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(DLQRecoveryService.name);
  private redis: Redis;

  private readonly ENTITY_CONFIGS: Record<string, EntityConfig> = {
    user: {
      repository: 'UserRepository',
      operations: ['create', 'update'],
      retryStrategy: {
        maxRetries: 5,
        retryDelay: 60000,
        backoffMultiplier: 2,
      },
    },
    conversation: {
      repository: 'ConversationRepository',
      operations: ['create', 'update', 'delete'],
      retryStrategy: {
        maxRetries: 5,
        retryDelay: 60000,
        backoffMultiplier: 2,
      },
    },
    message: {
      repository: 'MessageRepository',
      operations: ['create', 'update', 'delete', 'one-to-one-seen'],
      retryStrategy: {
        maxRetries: 3,
        retryDelay: 30000,
        backoffMultiplier: 2,
      },
    },
    group: {
      repository: 'GroupRepository',
      operations: ['create', 'update', 'delete'],
      retryStrategy: {
        maxRetries: 4,
        retryDelay: 45000,
        backoffMultiplier: 2,
      },
    },
    'group-message-seen': {
      repository: 'GroupRepository', 
      operations: ['create'], 
      retryStrategy: {
        maxRetries: 3,
        retryDelay: 30000,
        backoffMultiplier: 2,
      },
    },
    member: {
      repository: 'GroupRepository', // Uses GroupRepository with upsertMemberBatch method
      operations: ['create', 'update'],
      retryStrategy: {
        maxRetries: 3,
        retryDelay: 30000,
        backoffMultiplier: 2,
      },
      customRetryLogic: async (repo: any, operation: string, data: any[]) => {
        if (operation === 'update' && data.length > 0) {
          const batch = data;
          const groupId = batch[0]?.group_id;
          
          if (groupId && batch.every(m => m.user_id)) {
            try {
              await repo.removeMembers(groupId);
              await repo.upsertMemberBatch(batch);
              return true;
            } catch (error) {
              this.logger.error('Custom member update logic failed', error);
              return false;
            }
          }
        }
        return false;
      },
    },
  };

  private readonly PERMANENT_FAILURE_KEY = 'dlq:permanent_failures';
  private repositoryCache: Map<string, any> = new Map();

  constructor(
    @InjectQueue('user-queue') private userQueue: Queue,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    this.redis = (await this.userQueue.client) as Redis;
    this.logger.log('DLQRecoveryService initialized with all processors');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processAllDLQs() {
    this.logger.log('Starting DLQ recovery process for all entities...');

    for (const [entity, config] of Object.entries(this.ENTITY_CONFIGS)) {
      for (const operation of config.operations) {
        const dlqKey = `dlq:${entity}:${operation}`;
        try {
          await this.processDLQ(entity, operation, dlqKey, config);
        } catch (error) {
          this.logger.error(`Error processing DLQ ${dlqKey}`, error);
        }
      }
    }
  }

  private async processDLQ(
    entity: string,
    operation: string,
    dlqKey: string,
    config: EntityConfig,
  ) {
    const count = await this.redis.llen(dlqKey);

    if (count === 0) return;

    this.logger.log(`Processing ${count} entries from ${dlqKey}`);

    const batchSize = Math.min(10, count);

    for (let i = 0; i < batchSize; i++) {
      const entryJson = await this.redis.rpop(dlqKey);
      if (!entryJson) continue;

      try {
        await this.processDLQEntry(entity, operation, dlqKey, entryJson, config);
      } catch (error) {
        this.logger.error(`Error processing DLQ entry from ${dlqKey}`, error);
        await this.redis.lpush(dlqKey, entryJson);
      }
    }
  }

  private async processDLQEntry(
    entity: string,
    operation: string,
    dlqKey: string,
    entryJson: string,
    config: EntityConfig,
  ) {
    const entry: DLQEntry = JSON.parse(entryJson);
    const retryCount = entry.retryCount || 0;
    const strategy = config.retryStrategy;

    if (retryCount >= strategy.maxRetries) {
      this.logger.warn(
        `Max retries (${strategy.maxRetries}) exceeded for ${entity}:${operation}`,
      );
      await this.moveToPermanentFailure(
        entry,
        entity,
        operation,
        'Max retries exceeded',
      );
      return;
    }

    const delay =
      strategy.retryDelay * Math.pow(strategy.backoffMultiplier, retryCount);
    const timeSinceFailure = Date.now() - new Date(entry.failedAt).getTime();

    if (timeSinceFailure < delay) {
      await this.redis.lpush(dlqKey, entryJson);
      return;
    }

    this.logger.log(
      `Retrying ${entity}:${operation} (attempt ${retryCount + 1}/${strategy.maxRetries})`,
    );

    const success = await this.retryBatch(
      entity,
      operation,
      entry.data,
      config,
    );

    if (success) {
      this.logger.log(
        `Successfully recovered ${entry.dataCount} ${entity} records`,
      );
    } else {
      entry.retryCount = retryCount + 1;
      entry.failedAt = new Date().toISOString();
      await this.redis.lpush(dlqKey, JSON.stringify(entry));
      this.logger.warn(
        `Retry failed for ${entity}:${operation}, will retry later (${entry.retryCount}/${strategy.maxRetries})`,
      );
    }
  }

  private async getRepository(repositoryName: string): Promise<any> {
    if (this.repositoryCache.has(repositoryName)) {
      return this.repositoryCache.get(repositoryName);
    }

    try {
      const repository = await this.moduleRef.get(repositoryName, {
        strict: false,
      });
      this.repositoryCache.set(repositoryName, repository);
      return repository;
    } catch (error) {
      this.logger.error(`Repository ${repositoryName} not found`, error);
      return null;
    }
  }

  private async retryBatch(
    entity: string,
    operation: string,
    data: any[],
    config: EntityConfig,
  ): Promise<boolean> {
    const repository = await this.getRepository(config.repository);

    if (!repository) {
      this.logger.error(`Repository ${config.repository} not available`);
      return false;
    }

    // Try custom retry logic first if available
    if (config.customRetryLogic) {
      try {
        const customSuccess = await config.customRetryLogic(repository, operation, data);
        if (customSuccess) {
          return true;
        }
      } catch (error) {
        this.logger.warn('Custom retry logic failed, falling back to standard', error);
      }
    }

    try {
      switch (operation) {
        case 'create':
          await this.handleCreate(repository, data, entity);
          break;
        case 'update':
          await this.handleUpdate(repository, data, entity);
          break;
        case 'delete':
          await this.handleDelete(repository, data);
          break;
        case 'one-to-one-seen':
          await this.handleOneToOneSeen(repository, data);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
      return true;
    } catch (error) {
      this.logger.warn(`Batch operation failed, trying individual fallback`, error);
      return await this.individualFallback(repository, operation, data, entity);
    }
  }

  private async handleCreate(repository: any, data: any[], entity: string) {
    if (entity === 'group-message-seen') {
      if (typeof repository.groupMessageSeenBatch === 'function') {
        await repository.groupMessageSeenBatch(data);
      } else {
        throw new Error('groupMessageSeenBatch method not available');
      }
      return;
    }

    if (entity === 'member') {
      if (typeof repository.upsertMemberBatch === 'function') {
        await repository.upsertMemberBatch(data);
      } else {
        throw new Error('upsertMemberBatch method not available');
      }
      return;
    }

    if (typeof repository.upsertBatch === 'function') {
      await repository.upsertBatch(data);
    } else if (typeof repository.createBatch === 'function') {
      await repository.createBatch(data);
    } else {
      throw new Error('No batch create method available');
    }
  }

  private async handleUpdate(repository: any, data: any[], entity: string) {
    if (entity === 'member') {
      if (typeof repository.upsertMemberBatch === 'function') {
        await repository.upsertMemberBatch(data);
      } else {
        throw new Error('upsertMemberBatch method not available');
      }
      return;
    }

    if (typeof repository.upsertBatch === 'function') {
      await repository.upsertBatch(data);
    } else if (typeof repository.updateBatch === 'function') {
      await repository.updateBatch(data);
    } else {
      throw new Error('No batch update method available');
    }
  }

  private async handleDelete(repository: any, data: any[]) {
    if (typeof repository.deleteBatch === 'function') {
      await repository.deleteBatch(data);
    } else {
      throw new Error('No batch delete method available');
    }
  }

  private async handleOneToOneSeen(repository: any, data: any[]) {
    if (typeof repository.oneToOneChatMessageSeenBatch === 'function') {
      await repository.oneToOneChatMessageSeenBatch(data);
    } else {
      throw new Error('No one-to-one seen batch method available');
    }
  }

  private async individualFallback(
    repository: any,
    operation: string,
    data: any[],
    entity: string,
  ): Promise<boolean> {
    this.logger.log(
      `Attempting individual fallback for ${data.length} records...`,
    );

    let successCount = 0;
    const failedRecords: any[] = [];

    for (const record of data) {
      try {
        await this.processIndividualRecord(repository, operation, record, entity);
        successCount++;
        await this.sleep(50);
      } catch (error) {
        const idField = this.getIdField(entity);
        this.logger.error(
          `Individual record failed: ${entity} ${record[idField] || record}`,
          error,
        );
        failedRecords.push({
          entity,
          operation,
          record,
          error: error.message,
        });
      }
    }

    if (failedRecords.length > 0) {
      await this.storePermanentFailures(failedRecords);
    }

    const successRate = successCount / data.length;
    this.logger.log(
      `Individual fallback completed: ${successCount}/${data.length} succeeded (${(successRate * 100).toFixed(1)}%)`,
    );

    return successRate >= 0.8;
  }

  private async processIndividualRecord(
    repository: any,
    operation: string,
    record: any,
    entity: string,
  ) {
    const idField = this.getIdField(entity);

    switch (operation) {
      case 'create':
        if (typeof repository.create === 'function') {
          await repository.create(record);
        } else if (typeof repository.upsert === 'function') {
          await repository.upsert(record);
        } else {
          throw new Error('No individual create method available');
        }
        break;
      case 'update':
        if (typeof repository.update === 'function') {
          await repository.update(record[idField], record);
        } else if (typeof repository.upsert === 'function') {
          await repository.upsert(record);
        } else {
          throw new Error('No individual update method available');
        }
        break;
      case 'delete':
        if (typeof repository.delete === 'function') {
          if (typeof record === 'string' || typeof record === 'number') {
            await repository.delete(record);
          } else {
            await repository.delete(record[idField]);
          }
        } else {
          throw new Error('No individual delete method available');
        }
        break;
      case 'one-to-one-seen':
        if (typeof repository.markAsSeen === 'function') {
          await repository.markAsSeen(record);
        } else if (typeof repository.oneToOneChatMessageSeen === 'function') {
          await repository.oneToOneChatMessageSeen(record);
        } else {
          throw new Error('No individual seen method available');
        }
        break;
      default:
        throw new Error(`Cannot process individual record for operation: ${operation}`);
    }
  }

  private getIdField(entity: string): string {
    const idFields: Record<string, string> = {
      user: 'user_id',
      conversation: 'conversation_id',
      message: 'id',
      group: 'group_id',
      'group-message-seen': 'id',
      member: 'id',
    };
    return idFields[entity] || 'id';
  }

  private async moveToPermanentFailure(
    entry: DLQEntry,
    entity: string,
    operation: string,
    reason: string,
  ) {
    const failure = {
      entity,
      ...entry,
      operation,
      permanentFailureReason: reason,
      permanentFailedAt: new Date().toISOString(),
    };

    await this.redis.lpush(this.PERMANENT_FAILURE_KEY, JSON.stringify(failure));
    
    // Keep only last 10000 permanent failures
    await this.redis.ltrim(this.PERMANENT_FAILURE_KEY, 0, 9999);

    this.logger.error(
      `PERMANENT FAILURE: ${entity}:${operation} - ${reason} - ${entry.dataCount} records`,
    );
  }

  private async storePermanentFailures(failures: any[]) {
    const timestamp = new Date().toISOString();

    for (const failure of failures) {
      await this.redis.lpush(
        this.PERMANENT_FAILURE_KEY,
        JSON.stringify({
          ...failure,
          permanentFailedAt: timestamp,
          permanentFailureReason: 'Individual processing failed after retries',
        }),
      );
    }

    // Keep only last 10000 permanent failures
    await this.redis.ltrim(this.PERMANENT_FAILURE_KEY, 0, 9999);

    this.logger.error(`Stored ${failures.length} permanent failures`);
  }

  async manualRetry(entity: string, operation: string): Promise<number> {
    const config = this.ENTITY_CONFIGS[entity];

    if (!config) {
      throw new Error(`Unknown entity: ${entity}`);
    }

    if (!config.operations.includes(operation)) {
      throw new Error(`Invalid operation ${operation} for entity ${entity}`);
    }

    const dlqKey = `dlq:${entity}:${operation}`;
    const count = await this.redis.llen(dlqKey);

    this.logger.log(`Manual retry triggered for ${dlqKey}, ${count} entries`);

    const maxBatch = 50;
    const processCount = Math.min(count, maxBatch);

    for (let i = 0; i < processCount; i++) {
      const entryJson = await this.redis.rpop(dlqKey);
      if (!entryJson) break;
      
      try {
        await this.processDLQEntry(entity, operation, dlqKey, entryJson, config);
      } catch (error) {
        this.logger.error(`Error during manual retry of entry from ${dlqKey}`, error);
        // Push back to avoid losing data
        await this.redis.lpush(dlqKey, entryJson);
      }
    }

    return processCount;
  }

  async getDLQStats() {
    const stats: Record<string, any> = {};

    for (const [entity, config] of Object.entries(this.ENTITY_CONFIGS)) {
      stats[entity] = {};
      for (const operation of config.operations) {
        const dlqKey = `dlq:${entity}:${operation}`;
        const count = await this.redis.llen(dlqKey);
        stats[entity][operation] = count;
      }
    }

    const permanentFailures = await this.redis.llen(this.PERMANENT_FAILURE_KEY);
    stats.permanentFailures = permanentFailures;

    const totalDLQ = Object.values(stats)
      .filter((v) => typeof v === 'object')
      .reduce((sum, entity) => {
        return (
          sum +
          Object.values(entity as any).reduce(
            (s: number, v: any) => s + (v as number),
            0,
          )
        );
      }, 0);

    stats.totalDLQ = totalDLQ;

    return stats;
  }

  async getPermanentFailures(limit: number = 100, offset: number = 0) {
    const failures = await this.redis.lrange(
      this.PERMANENT_FAILURE_KEY,
      offset,
      offset + limit - 1,
    );

    return failures.map((f) => {
      try {
        return JSON.parse(f);
      } catch (error) {
        this.logger.error('Failed to parse permanent failure', error);
        return null;
      }
    }).filter(Boolean);
  }

  async clearPermanentFailures(limit?: number) {
    if (limit) {
      const items = await this.redis.lrange(
        this.PERMANENT_FAILURE_KEY,
        0,
        limit - 1,
      );
      await this.redis.ltrim(this.PERMANENT_FAILURE_KEY, limit, -1);
      return items.length;
    } else {
      const count = await this.redis.llen(this.PERMANENT_FAILURE_KEY);
      await this.redis.del(this.PERMANENT_FAILURE_KEY);
      return count;
    }
  }

  addEntityConfig(entity: string, config: EntityConfig) {
    this.ENTITY_CONFIGS[entity] = config;
    this.logger.log(`Added entity configuration: ${entity}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}