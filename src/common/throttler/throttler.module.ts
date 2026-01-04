import { Module, Global } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RedisService } from '../services/redis.service';
import { RedisThrottlerStorage } from '../storage/redis-throttle.storage';
import { ChatThrottlerGuard } from '../guard/throttler.guard';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [
          {
            ttl: 60,   // 60 seconds window
            limit: 90, // 90 requests per window
            // blockDuration: 300, // Uncomment and set if you want blocking after limit
          },
        ],
        storage: new RedisThrottlerStorage(redisService),
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ChatThrottlerGuard,
    },
  ],
})
export class ThrottleModule {}