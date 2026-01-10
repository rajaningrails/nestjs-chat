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
  repository: string; // Repository class name
  operations: string[]; // Supported operations
  retryStrategy: RetryStrategy;
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
        retryDelay: 60000, // 1 minute
        backoffMultiplier: 2,
      },
    },
    // conversation: {
    //   repository: 'ConversationRepository',
    //   operations: ['create', 'update'],
    //   retryStrategy: {
    //     maxRetries: 5,
    //     retryDelay: 60000,
    //     backoffMultiplier: 2,
    //   },
    // },
    // message: {
    //   repository: 'MessageRepository',
    //   operations: ['create', 'update', 'delete'],
    //   retryStrategy: {
    //     maxRetries: 3,
    //     retryDelay: 30000, // 30 seconds (messages are more time-sensitive)
    //     backoffMultiplier: 2,
    //   },
    // },
  };

  private readonly PERMANENT_FAILURE_KEY = 'dlq:permanent_failures';
  private repositoryCache: Map<string, any> = new Map();

  constructor(
    @InjectQueue('user-queue') private userQueue: Queue,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    this.redis = (await this.userQueue.client) as Redis;
    this.logger.log('DLQRecoveryService initialized');
  }

  /**
   * Main recovery cron - runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processAllDLQs() {
    this.logger.log('Starting DLQ recovery process...');

    for (const [entity, config] of Object.entries(this.ENTITY_CONFIGS)) {
      for (const operation of config.operations) {
        const dlqKey = `dlq:${entity}:${operation}`;
        await this.processDLQ(entity, operation, dlqKey, config);
      }
    }
  }

  /**
   * Process a specific DLQ
   */
  private async processDLQ(
    entity: string,
    operation: string,
    dlqKey: string,
    config: EntityConfig,
  ) {
    const count = await this.redis.llen(dlqKey);

    if (count === 0) return;

    this.logger.log(`Processing ${count} entries from ${dlqKey}`);

    // Process entries one at a time to avoid system overload
    const batchSize = Math.min(10, count); // Process max 10 at a time

    for (let i = 0; i < batchSize; i++) {
      const entryJson = await this.redis.rpop(dlqKey);
      if (!entryJson) continue;

      await this.processDLQEntry(entity, operation, dlqKey, entryJson, config);
    }
  }

  /**
   * Process a single DLQ entry
   */
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

    // Check if max retries exceeded
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

    // Calculate retry delay with exponential backoff
    const delay =
      strategy.retryDelay * Math.pow(strategy.backoffMultiplier, retryCount);
    const timeSinceFailure = Date.now() - new Date(entry.failedAt).getTime();

    if (timeSinceFailure < delay) {
      // Not ready to retry yet, push back to queue
      await this.redis.lpush(dlqKey, entryJson);
      return;
    }

    // Attempt retry
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
      // Increment retry count and push back to DLQ
      entry.retryCount = retryCount + 1;
      entry.failedAt = new Date().toISOString();
      await this.redis.lpush(dlqKey, JSON.stringify(entry));
      this.logger.warn(
        `Retry failed for ${entity}:${operation}, will retry later (${entry.retryCount}/${strategy.maxRetries})`,
      );
    }
  }

  /**
   * Get repository instance (with caching)
   */
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

  /**
   * Retry a batch operation
   */
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

    try {
      // Try batch operation first
      switch (operation) {
        case 'create':
          if (typeof repository.createBatch === 'function') {
            await repository.createBatch(data);
          } else {
            throw new Error('createBatch method not found');
          }
          break;
        case 'update':
          if (typeof repository.updateBatch === 'function') {
            await repository.updateBatch(data);
          } else {
            throw new Error('updateBatch method not found');
          }
          break;
        case 'delete':
          if (typeof repository.deleteBatch === 'function') {
            await repository.deleteBatch(data);
          } else {
            throw new Error('deleteBatch method not found');
          }
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
      return true;
    } catch (error) {
      this.logger.warn(
        `Batch operation failed, trying individual fallback`,
        error,
      );
      return await this.individualFallback(repository, operation, data, entity);
    }
  }

  /**
   * Individual record fallback when batch fails
   */
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
        switch (operation) {
          case 'create':
            await repository.create(record);
            break;
          case 'update':
            const idField = this.getIdField(entity);
            await repository.update(record[idField], record);
            break;
          case 'delete':
            const deleteIdField = this.getIdField(entity);
            await repository.delete(record[deleteIdField]);
            break;
        }
        successCount++;
        // Small delay to avoid overwhelming DB
        await this.sleep(50);
      } catch (error) {
        const idField = this.getIdField(entity);
        this.logger.error(
          `Individual record failed: ${entity} ${record[idField]}`,
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

  /**
   * Get ID field name for entity
   */
  private getIdField(entity: string): string {
    const idFields: Record<string, string> = {
      user: 'user_id',
      conversation: 'conversation_id',
      message: 'message_id',
    };
    return idFields[entity] || 'id';
  }

  /**
   * Move entry to permanent failure storage
   */
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

    this.logger.error(
      `PERMANENT FAILURE: ${entity}:${operation} - ${reason} - ${entry.dataCount} records`,
    );
  }

  /**
   * Store individual permanent failures
   */
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

    this.logger.error(`Stored ${failures.length} permanent failures`);
  }

  /**
   * Manual retry for specific entity/operation
   */
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

    // Process all entries
    const maxBatch = 50;
    const processCount = Math.min(count, maxBatch);

    for (let i = 0; i < processCount; i++) {
      await this.processDLQ(entity, operation, dlqKey, config);
    }

    return processCount;
  }

  /**
   * Get comprehensive DLQ statistics
   */
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

    // Get total across all DLQs
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

  /**
   * Get permanent failures with pagination
   */
  async getPermanentFailures(limit: number = 100, offset: number = 0) {
    const failures = await this.redis.lrange(
      this.PERMANENT_FAILURE_KEY,
      offset,
      offset + limit - 1,
    );

    return failures.map((f) => JSON.parse(f));
  }

  /**
   * Clear permanent failures
   */
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

  /**
   * Add new entity configuration at runtime
   */
  addEntityConfig(entity: string, config: EntityConfig) {
    this.ENTITY_CONFIGS[entity] = config;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
