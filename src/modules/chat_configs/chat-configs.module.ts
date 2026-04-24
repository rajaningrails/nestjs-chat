import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateChatConfigDto } from './dto/chat-configs.dto';
import { ChatConfigController } from './chat-configs.controller';
import { ChatConfigUseCase } from './use-cases/chat-config.use-case';
import { ChatConfigRepository } from './repositories/chat-config.repository';
import { ChatConfig } from './entities/chat-configs.entity';
import { IChatConfigRepositoryToken } from './repositories/chat-config.repository.interface';
import { GetChatConfigUseCase } from './use-cases/get-chat-config.use-case';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatConfig]) // assuming fixed
  ],
  controllers: [ChatConfigController],
  providers: [
    ChatConfigUseCase,
    GetChatConfigUseCase,
    {
      provide: IChatConfigRepositoryToken,
      useClass: ChatConfigRepository,
    },
  ],
  exports: [
    ChatConfigUseCase,
    GetChatConfigUseCase,
    {
      provide: IChatConfigRepositoryToken,
      useClass: ChatConfigRepository,
    },
  ],
})
export class ChatConfigModule {}