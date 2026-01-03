import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis.service';

@Injectable()
export class SocketRateLimiter {
  private readonly logger = new Logger(SocketRateLimiter.name);
  private readonly RATE_LIMIT_PREFIX = 'ratelimit:socket:';

  constructor(private readonly redisService: RedisService) {}

  private get redis() {
    return this.redisService.getClient();
  }

  /**
   * Check if user has exceeded rate limit
   * @param userId User ID
   * @param action Action name (e.g., 'send-message', 'typing')
   * @param limit Max requests per window
   * @param windowMs Time window in milliseconds
   */
  async checkRateLimit(
    userId: number,
    action: string,
    limit: number = 60,
    windowMs: number = 60000, // 1 minute
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = `${this.RATE_LIMIT_PREFIX}${userId}:${action}`;
    const windowSeconds = Math.ceil(windowMs / 1000);

    try {
      const current = await this.redis.incr(key);

      if (current === 1) {
        await this.redis.expire(key, windowSeconds);
      }

      const allowed = current <= limit;
      const remaining = Math.max(0, limit - current);

      if (!allowed) {
        this.logger.warn(
          `Rate limit exceeded for user ${userId} on action ${action}`,
        );
      }

      return { allowed, remaining };
    } catch (error) {
      this.logger.error('Rate limit check failed:', error);
      // Fail open - allow the request if Redis is down
      return { allowed: true, remaining: limit };
    }
  }

  /**
   * Reset rate limit for a user/action
   */
  async resetRateLimit(userId: number, action: string): Promise<void> {
    const key = `${this.RATE_LIMIT_PREFIX}${userId}:${action}`;
    await this.redis.del(key);
  }
}