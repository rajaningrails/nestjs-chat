import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { DLQController } from './dlq.controller';
import { DLQRecoveryService } from './dlq-recovery.service';
import { UsersModule } from '../users/users.module';
import { ConversationsModule } from '../conversations/conversation.module';
import { MessageModule } from '../messages/message.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),

    BullModule.registerQueue({
      name: 'user-queue',
    }),
    UsersModule,
    ConversationsModule,
    MessageModule,
    GroupModule,
  ],
  controllers: [DLQController],
  providers: [DLQRecoveryService],
  exports: [DLQRecoveryService],
})
export class DLQModule {}
