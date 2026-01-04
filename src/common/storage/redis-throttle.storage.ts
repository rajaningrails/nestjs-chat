import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../services/redis.service';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  private get redis() {
    return this.redisService.getClient();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const pipeline = this.redis.pipeline();

    pipeline.incr(redisKey);
    pipeline.ttl(redisKey);

    const results = await pipeline.exec();
    if (!results) {
      throw new Error('Redis pipeline execution failed');
    }

    const [[incrErr, totalHitsRaw], [ttlErr, timeToExpireRaw]] = results;

    if (incrErr) throw incrErr;
    if (ttlErr) throw ttlErr;

    const totalHits = Number(totalHitsRaw);
    let timeToExpire = Number(timeToExpireRaw);

    if (timeToExpire === -2 || timeToExpire === -1) {
      await this.redis.expire(redisKey, ttl);
      timeToExpire = ttl;
    }

    const isBlocked = totalHits > limit;
    let timeToBlockExpire = 0;

    if (isBlocked && blockDuration > 0) {
      await this.redis.expire(redisKey, blockDuration);
      timeToExpire = blockDuration;
      timeToBlockExpire = blockDuration;
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}