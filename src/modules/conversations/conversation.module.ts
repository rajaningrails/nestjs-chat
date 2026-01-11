import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller';
import { IConversationRepositoryToken } from './repositories/conversation.repository.interface';
import { ConversationRepository } from './repositories/conversation.repository';
import { Conversation } from './entities/conversation.entity';
import { ConversationService } from './services/conversation.service';
import { conversationQueueConfig } from 'src/infrastructure/bullmq';
import { MessageModule } from '../messages/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation]),
    conversationQueueConfig,
    MessageModule,
  ],
  controllers: [ConversationController],
  providers: [
    {
      provide: IConversationRepositoryToken,
      useClass: ConversationRepository,
    },
    ConversationService,
    ConversationRepository,
  ],
  exports: [IConversationRepositoryToken, ConversationRepository,ConversationService],
})
export class ConversationsModule {}

