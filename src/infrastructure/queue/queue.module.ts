import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { queueConfig } from '../config/queue.config';

@Module({
  imports: [
    ConfigModule.forFeature(queueConfig),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          enableOfflineQueue: false,
          retryStrategy: (times) => {
            const delay = Math.min(times * 1000, 10000);
            return delay;
          },
        },
        defaultJobOptions: {
          removeOnComplete: {
            age: 3600,
            count: 100,
          },
          removeOnFail: false, // Keep failed jobs for recovery
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class QueueModule {}
