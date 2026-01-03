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
          // maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          enableOfflineQueue: false,
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class QueueModule {}
