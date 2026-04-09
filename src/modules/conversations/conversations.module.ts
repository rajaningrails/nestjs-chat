import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationController } from './conversation.controller';
import { IConversationRepositoryToken } from './repositories/conversation.repository.interface';
import { ConversationRepository } from './repositories/conversation.repository';
import { Conversation } from './entities/conversation.entity';
import { ConversationService } from './services/conversation.service';
import { MessageModule } from '../messages/message.module';
import { UsersModule } from '../users/users.module';
import { GroupModule } from '../group/group.module';
import { S3Module } from 'src/infrastructure/aws/aws.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation]),
    forwardRef(() => MessageModule),
    UsersModule,
    GroupModule,
    S3Module
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
  exports: [
    IConversationRepositoryToken,
    ConversationRepository,
    ConversationService,
  ],
})
export class ConversationsModule {}
