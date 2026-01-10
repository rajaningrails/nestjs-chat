import { Module } from '@nestjs/common';
import { DLQController } from './dlq.controller';
import { DLQRecoveryService } from './dlq-recovery.service';

@Module({
    imports: [],
    controllers: [DLQController],
    providers: [
        DLQRecoveryService
    ],
})
export class DLQModule { }
