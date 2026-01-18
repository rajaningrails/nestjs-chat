import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { messageQueueConfig } from 'src/infrastructure/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'messages',
    }),
    messageQueueConfig,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
  ],
})
export class HealthModule {}
