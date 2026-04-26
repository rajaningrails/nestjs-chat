import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { MessageController } from './message.controller';
import { MessageRepository } from './repositories/message.repository';
import { IMessageRepositoryToken } from './repositories/message.repository.interface';
import { MessageService } from './services/message.service';
import { MessageProcessor } from './processor/message.processor';
import { User } from '../users/entities/user.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { messageQueueConfig } from 'src/infrastructure/bullmq';
import { UsersModule } from '../users/users.module';
import { MessageGateway } from './gateway/message.gateway';
import { SendMessageUseCase } from './use-cases/send-message.use-case';
import { CreateMessageUseCase } from './use-cases/create-message.use-case';
import { DeleteMessageUseCase } from './use-cases/delete-message.use-case';
import { MessageSeenUseCase } from './use-cases/message-seen.use-case';
import { GroupModule } from '../group/group.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { S3Module } from 'src/infrastructure/aws/aws.module';
import { ChatConfigModule } from '../chat_configs/chat-configs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, User, Conversation]),
    messageQueueConfig,
    forwardRef(() => ConversationsModule),
    forwardRef(() => GroupModule),
    UsersModule,
    S3Module,
    forwardRef(() => ChatConfigModule),
  ],
  controllers: [MessageController],
  providers: [
    {
      provide: IMessageRepositoryToken,
      useClass: MessageRepository,
    },
    MessageRepository,
    MessageService,
    MessageProcessor,
    MessageGateway,
    SendMessageUseCase,
    CreateMessageUseCase,
    DeleteMessageUseCase,
    MessageSeenUseCase,
  ],
  exports: [IMessageRepositoryToken, MessageRepository, MessageService],
})
export class MessageModule {}
