import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import Conversation from './entities/conversation.entity';
import { ConversationController } from './conversation.controller';
import { IConversationRepositoryToken } from './repositories/conversation.repository.interface';
import { ConversationRepository } from './repositories/conversation.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation])],
  controllers: [ConversationController],
  providers: [
    {
      provide: IConversationRepositoryToken,
      useClass: ConversationRepository,
    },
    ConversationRepository
  ],
  exports: [IConversationRepositoryToken,ConversationRepository],
})

export class ConversationsModule { }