import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { conversationQueueConfig, groupQueueConfig, messageQueueConfig, userQueueConfig } from 'src/infrastructure/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'messages',
    }),
    userQueueConfig,
    messageQueueConfig,
    userQueueConfig,
    groupQueueConfig,
    conversationQueueConfig
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
  ],
})
export class HealthModule {}
