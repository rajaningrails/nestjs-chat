import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller';
import { IConversationRepositoryToken } from './repositories/conversation.repository.interface';
import { ConversationRepository } from './repositories/conversation.repository';
import { Conversation } from './entities/conversation.entity';

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