import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { DLQController } from './dlq.controller';
import { DLQRecoveryService } from './dlq-recovery.service';
import { MessageRepository } from '../messages/repositories/message.repository';
import { UserRepository } from '../users/repositories/user.repository';
import { ConversationRepository } from '../conversations/repositories/conversation.repository';
import { GroupRepository } from '../group/repositories/group.repository';

@Module({
  imports: [
    ScheduleModule.forRoot(),

    BullModule.registerQueue({
      name: 'user-queue',
    }),
  ],
  controllers: [DLQController],
  providers: [
    DLQRecoveryService,
    MessageRepository,
    UserRepository,
    ConversationRepository,
    GroupRepository,
  ],
  exports: [DLQRecoveryService],
})
export class DLQModule {}
