import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller';
import { IConversationRepositoryToken } from './repositories/conversation.repository.interface';
import { ConversationRepository } from './repositories/conversation.repository';
import { Conversation } from './entities/conversation.entity';
import { ConversationService } from './services/conversation.service';
import { conversationQueueConfig } from 'src/infrastructure/bullmq';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation]), conversationQueueConfig],
  controllers: [ConversationController],
  providers: [
    {
      provide: IConversationRepositoryToken,
      useClass: ConversationRepository,
    },
    ConversationService,
    ConversationRepository,
  ],
  exports: [IConversationRepositoryToken, ConversationRepository],
})
export class ConversationsModule {}
