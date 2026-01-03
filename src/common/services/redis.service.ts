import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password'),
      db: this.configService.get<number>('redis.db', 0),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const stringValue =
      typeof value === 'string' ? value : JSON.stringify(value);

    if (ttlSeconds) {
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
    if (keys.length) {
      await this.client.del(keys);
    }
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  async flushdb(): Promise<void> {
    await this.client.flushdb();
  }


  async cleanupStaleSocketConnections(): Promise<void> {
    try {
      const pattern = 'socket:*';
      const keys = await this.client.keys(pattern);

      if (keys.length === 0) {
        // this.logger.verbose('No socket keys found to clean.');
        return;
      }

      // this.logger.log(`Scanning ${keys.length} socket keys for stale entries...`);

      const staleKeys: string[] = [];
      const pipeline = this.client.pipeline();

      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl <= -1) { // -1: no expiry, -2: already expired
          staleKeys.push(key);
          pipeline.del(key);
        }
      }

      if (staleKeys.length > 0) {
        await pipeline.exec(); // Execute all deletions atomically and efficiently
        // this.logger.log(`✅ Cleaned ${staleKeys.length} stale socket connection(s).`);
      } else {
        // this.logger.verbose('No stale socket keys found.');
      }
    } catch (error) {
      // this.logger.error('Failed to cleanup stale socket connections', error.stack);
    }
  }

  getClient(): Redis {
    return this.client;
  }

  @Cron(CronExpression.EVERY_2_HOURS)
  async handleStaleSocketCleanup() {
    await this.cleanupStaleSocketConnections();
  }
}
