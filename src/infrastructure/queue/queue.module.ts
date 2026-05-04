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
          host: configService.get<string>('queue.redis.host'),
          port: configService.get<number>('queue.redis.port'),
          password: configService.get<string>('queue.redis.password'),
          db: configService.get<number>('queue.redis.db'),
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
