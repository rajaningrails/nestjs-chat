import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Redis as RedisClient } from 'ioredis';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: RedisClient;
  private isConnected: boolean = false;

  constructor(private configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password') || undefined,
      db: this.configService.get<number>('redis.db', 0),
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(
          `Redis reconnection attempt #${times}, retrying in ${delay}ms`,
        );
        return delay;
      },
      maxRetriesPerRequest: 3,
      reconnectOnError: (err) => {
        const targetErrors = ['ECONNREFUSED', 'NR_CLOSED'];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis Client Connected');
      this.isConnected = true;
    });
    this.client.on('ready', () => this.logger.log('Redis Client Ready'));
    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
      this.isConnected = false;
    });
    this.client.on('close', () => {
      this.logger.warn('Redis Connection Closed');
      this.isConnected = false;
    });
    this.client.on('reconnecting', () =>
      this.logger.warn('Redis Client Reconnecting...'),
    );
  }

  async onModuleInit() {
    await this.client.ping();
    await this.enableKeyspaceNotifications();
  }

  private async enableKeyspaceNotifications(): Promise<void> {
    try {
      await this.client.config('SET', 'notify-keyspace-events', 'Ex');
    } catch (error) {
      this.logger.error('Failed to enable keyspace notifications', error);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis Client Disconnected');
    }
  }

  async waitUntilReady(): Promise<void> {
    if (this.client.status === 'ready') return;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timed out after 10s'));
      }, 10000);

      this.client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value === null) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);

    if (ttlSeconds !== undefined) {
      await this.client.setex(key, ttlSeconds, stringValue);
    } else {
      await this.client.set(key, stringValue);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(keys);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async flushdb(): Promise<void> {
    await this.client.flushdb();
  }

  async cleanupStaleSocketConnections(): Promise<void> {
    try {
      const pattern = 'socket:*';
      const keys = await this.client.keys(pattern);

      if (keys.length === 0) {
        return;
      }

      const pipeline = this.client.pipeline();
      let deletedCount = 0;

      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -2 || ttl === -1) {
          pipeline.del(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        await pipeline.exec();
        this.logger.debug(`Cleaned up ${deletedCount} stale socket keys`);
      }
    } catch (error) {
      this.logger.error('Error during stale socket cleanup', error);
    }
  }

  getClient(): RedisClient {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  async lpush(key: string, value: string) {
    await this.client.lpush(key, value);
  }

  async llen(key: string) {
    return await this.client.llen(key);
  }

  async multi() {
    return this.client.multi();
  }

  @Cron(CronExpression.EVERY_2_HOURS)
  async handleStaleSocketCleanup() {
    this.logger.debug('Running stale socket connections cleanup...');
    await this.cleanupStaleSocketConnections();
  }
}
