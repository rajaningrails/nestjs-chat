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
  dataCount: number;
  data: any[];
  retryCount?: number;
}

interface EntityConfig {
  repository: string;
  operations: string[];
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
}

@Injectable()
export class DLQRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(DLQRecoveryService.name);
  private redis: Redis;

  private readonly ENTITY_CONFIGS: Record<string, EntityConfig> = {
    message: {
      repository: 'MessageRepository',
      operations: ['create', 'update', 'delete', 'one-to-one-seen'],
      maxRetries: 3,
      retryDelay: 30000,
      backoffMultiplier: 2,
    },
    conversation: {
      repository: 'ConversationRepository',
      operations: ['conversation-update'],
      maxRetries: 3,
      retryDelay: 30000,
      backoffMultiplier: 2,
    },
    group: {
      repository: 'GroupRepository',
      operations: ['group-message-seen'],
      maxRetries: 3,
      retryDelay: 30000,
      backoffMultiplier: 2,
    },
    user:{
      repository: 'UserRepository',
      operations: ['user-sync'],
      maxRetries: 3,
      retryDelay: 30000,
      backoffMultiplier: 2,
    }
  };

  private readonly PERMANENT_FAILURE_KEY = 'dlq:permanent_failures';
  private repositoryCache = new Map<string, any>();

  constructor(
    @InjectQueue('user-queue') private userQueue: Queue,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    this.redis = (await this.userQueue.client) as Redis;
    this.logger.log('DLQ Recovery Service initialized');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processAllDLQs() {
    this.logger.log('Starting DLQ recovery process...');

    for (const [entity, config] of Object.entries(this.ENTITY_CONFIGS)) {
      for (const operation of config.operations) {
        try {
          await this.processDLQ(entity, operation, config);
        } catch (error) {
          this.logger.error(`Error processing ${entity}:${operation}`, error);
        }
      }
    }
  }

  private async processDLQ(entity: string, operation: string, config: EntityConfig) {
    const dlqKey = `dlq:${entity}:${operation}`;
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
        this.logger.error(`Error processing entry from ${dlqKey}`, error);
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

    if (retryCount >= config.maxRetries) {
      await this.moveToPermanentFailure(entry, entity, operation);
      return;
    }

    const delay = config.retryDelay * Math.pow(config.backoffMultiplier, retryCount);
    const timeSinceFailure = Date.now() - new Date(entry.failedAt).getTime();

    if (timeSinceFailure < delay) {
      await this.redis.lpush(dlqKey, entryJson);
      return;
    }

    this.logger.log(`Retrying ${entity}:${operation} (${retryCount + 1}/${config.maxRetries})`);

    const success = await this.retryOperation(entity, operation, entry.data, config);

    if (success) {
      this.logger.log(`Successfully recovered ${entry.dataCount} ${entity} records`);
    } else {
      entry.retryCount = retryCount + 1;
      entry.failedAt = new Date().toISOString();
      await this.redis.lpush(dlqKey, JSON.stringify(entry));
    }
  }

  private async retryOperation(
    entity: string,
    operation: string,
    data: any[],
    config: EntityConfig,
  ): Promise<boolean> {
    const repository = await this.getRepository(config.repository);
    if (!repository) return false;

    try {
      await this.executeOperation(repository, operation, data);
      return true;
    } catch (error) {
      this.logger.warn(`Batch failed, trying individual fallback`, error);
      return await this.individualFallback(repository, operation, data);
    }
  }

  private async executeOperation(repository: any, operation: string, data: any[]) {
    const operationMap: Record<string, string> = {
      'create': 'upsertBatch',
      'update': 'updateBatch',
      'delete': 'deleteBatch',
      'one-to-one-seen': 'oneToOneChatMessageSeenBatch',
      'group-message-seen': 'groupMessageSeenBatch',
      'conversation-update': 'updateBatch',
      'user-sync': 'upsertUsers',
    };

    const methodName = operationMap[operation];
    if (!methodName || typeof repository[methodName] !== 'function') {
      throw new Error(`Method ${methodName} not available in repository`);
    }

    await repository[methodName](data);
  }

  private async individualFallback(
    repository: any,
    operation: string,
    data: any[],
  ): Promise<boolean> {
    this.logger.log(`Individual fallback for ${data.length} records`);

    let successCount = 0;
    const failedRecords: any[] = [];

    for (const record of data) {
      try {
        await this.executeIndividualOperation(repository, operation, record);
        successCount++;
        await this.sleep(50);
      } catch (error) {
        failedRecords.push({ operation, record, error: error.message });
      }
    }

    if (failedRecords.length > 0) {
      await this.storePermanentFailures(failedRecords);
    }

    const successRate = successCount / data.length;
    this.logger.log(`Fallback: ${successCount}/${data.length} succeeded (${(successRate * 100).toFixed(1)}%)`);

    return successRate >= 0.8;
  }

  private async executeIndividualOperation(repository: any, operation: string, record: any) {
    switch (operation) {
      case 'create':
      case 'update':
      case 'conversation-update':
        if (typeof repository.upsert === 'function') {
          await repository.upsert(record);
        } else {
          throw new Error('No upsert method available');
        }
        break;
      case 'delete':
        const id = typeof record === 'object' ? record.id : record;
        await repository.delete(id);
        break;
      case 'one-to-one-seen':
        if (typeof repository.oneToOneChatMessageSeen === 'function') {
          await repository.oneToOneChatMessageSeen(record);
        } else {
          throw new Error('No seen method available');
        }
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  private async getRepository(repositoryName: string): Promise<any> {
    if (this.repositoryCache.has(repositoryName)) {
      return this.repositoryCache.get(repositoryName);
    }

    try {
      const repository = await this.moduleRef.get(repositoryName, { strict: false });
      this.repositoryCache.set(repositoryName, repository);
      return repository;
    } catch (error) {
      this.logger.error(`Repository ${repositoryName} not found`, error);
      return null;
    }
  }

  private async moveToPermanentFailure(entry: DLQEntry, entity: string, operation: string) {
    const failure = {
      entity,
      ...entry,
      operation,
      permanentFailedAt: new Date().toISOString(),
      reason: 'Max retries exceeded',
    };

    await this.redis.lpush(this.PERMANENT_FAILURE_KEY, JSON.stringify(failure));
    await this.redis.ltrim(this.PERMANENT_FAILURE_KEY, 0, 9999);

    this.logger.error(`PERMANENT FAILURE: ${entity}:${operation} - ${entry.dataCount} records`);
  }

  private async storePermanentFailures(failures: any[]) {
    const timestamp = new Date().toISOString();

    for (const failure of failures) {
      await this.redis.lpush(
        this.PERMANENT_FAILURE_KEY,
        JSON.stringify({ ...failure, permanentFailedAt: timestamp }),
      );
    }

    await this.redis.ltrim(this.PERMANENT_FAILURE_KEY, 0, 9999);
    this.logger.error(`Stored ${failures.length} permanent failures`);
  }

  async getDLQStats() {
    const stats: Record<string, any> = {};

    for (const [entity, config] of Object.entries(this.ENTITY_CONFIGS)) {
      stats[entity] = {};
      for (const operation of config.operations) {
        const dlqKey = `dlq:${entity}:${operation}`;
        stats[entity][operation] = await this.redis.llen(dlqKey);
      }
    }

    stats.permanentFailures = await this.redis.llen(this.PERMANENT_FAILURE_KEY);
    
    stats.totalDLQ = Object.values(stats)
      .filter((v) => typeof v === 'object')
      .reduce((sum, entity: any) => 
        sum + Object.values(entity).reduce((s: number, v: any) => s + v, 0), 0
      );

    return stats;
  }

  async getPermanentFailures(limit = 100, offset = 0) {
    const failures = await this.redis.lrange(
      this.PERMANENT_FAILURE_KEY,
      offset,
      offset + limit - 1,
    );

    return failures.map((f) => {
      try {
        return JSON.parse(f);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async clearPermanentFailures(limit?: number) {
    if (limit) {
      const items = await this.redis.lrange(this.PERMANENT_FAILURE_KEY, 0, limit - 1);
      await this.redis.ltrim(this.PERMANENT_FAILURE_KEY, limit, -1);
      return items.length;
    }
    
    const count = await this.redis.llen(this.PERMANENT_FAILURE_KEY);
    await this.redis.del(this.PERMANENT_FAILURE_KEY);
    return count;
  }

  async manualRetry(entity: string, operation: string): Promise<number> {
    const config = this.ENTITY_CONFIGS[entity];
    if (!config || !config.operations.includes(operation)) {
      throw new Error(`Invalid entity or operation: ${entity}:${operation}`);
    }

    const dlqKey = `dlq:${entity}:${operation}`;
    const count = await this.redis.llen(dlqKey);
    const processCount = Math.min(count, 50);

    this.logger.log(`Manual retry: ${dlqKey}, processing ${processCount}/${count} entries`);

    for (let i = 0; i < processCount; i++) {
      const entryJson = await this.redis.rpop(dlqKey);
      if (!entryJson) break;

      try {
        await this.processDLQEntry(entity, operation, dlqKey, entryJson, config);
      } catch (error) {
        this.logger.error(`Manual retry failed for entry`, error);
        await this.redis.lpush(dlqKey, entryJson);
      }
    }

    return processCount;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}