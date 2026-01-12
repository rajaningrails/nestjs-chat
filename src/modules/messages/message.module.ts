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
import { ConversationsModule } from '../conversations/conversation.module';
import { UsersModule } from '../users/users.module';
import { MessageGateway } from './gateway/message.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message,User,Conversation]),
    messageQueueConfig,
    forwardRef(() => ConversationsModule),
    UsersModule    
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
  ],
  exports: [IMessageRepositoryToken, MessageRepository, MessageService],
})
export class MessageModule {}
