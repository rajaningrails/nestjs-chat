import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './entities/message.entity';
import { MessageController } from './message.controller';
import { MessageRepository } from './repositories/message.repository';
import { IMessageRepositoryToken } from './repositories/message.repository.interface';
import { MessageService } from './services/message.service';
import { MessageProcessor } from './processor/message.processor';
import { MessageGateway } from './gateway/message.gateway';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message]),
    BullModule.registerQueue({
      name: 'messages',
    }),
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
  exports: [IMessageRepositoryToken, MessageRepository],
})
export class MessageModule {}
