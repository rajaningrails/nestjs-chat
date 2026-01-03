import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'messages',
    }),
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
  ],
})
export class HealthModule {}
