import { Module } from '@nestjs/common';
import { DLQController } from './dlq.controller';
import { DLQRecoveryService } from './dlq-recovery.service';
import { userQueueConfig } from 'src/infrastructure/bullmq';

@Module({
    imports: [
        userQueueConfig
    ],
    controllers: [DLQController],
    providers: [
        DLQRecoveryService
    ],
})
export class DLQModule { }
