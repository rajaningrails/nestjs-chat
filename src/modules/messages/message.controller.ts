import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Inject,
  ParseUUIDPipe,
  Delete,
} from '@nestjs/common';
import type { IMessageRepository } from './repositories/message.repository.interface';
import { IMessageRepositoryToken } from './repositories/message.repository.interface';
import { SkipThrottle } from '@nestjs/throttler';
import { CreateMessageDto } from './dto/create-message.dto';
import { SendMessageUseCase } from './use-cases/send-message.use-case';
import { CreateMessageUseCase } from './use-cases/create-message.use-case';
import { DeleteMessageUseCase } from './use-cases/delete-message.use-case';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { SeenMessageDto } from './dto/seen-message.dto';
import { MessageSeenUseCase } from './use-cases/message-seen.use-case';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('messages')
export class MessageController {
  constructor(
    @Inject(IMessageRepositoryToken)
    private readonly messageRepository: IMessageRepository,
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly createMessageUseCase: CreateMessageUseCase,
    private readonly deleteMessageUseCase: DeleteMessageUseCase,
    private readonly seenMessageUseCase: MessageSeenUseCase,
  ) {}

  @SkipThrottle()
  @Post('send-message')
  async sendMessage(@Body() dto: Partial<SendMessageDto>) {
    return this.sendMessageUseCase.execute(dto);
  }

  @Post('create-message')
  async createMessageConnection(@Body() dto: CreateMessageDto) {
    return this.createMessageUseCase.execute(dto);
  }

  @Post('update-seen-at')
  async markAsSeen(@Body() dto: SeenMessageDto) {
    return this.seenMessageUseCase.execute(dto);
  }

  @Post('deleteMessage')
  async deleteMessage(@Body() request: DeleteMessageDto) {
    return this.deleteMessageUseCase.execute(request);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: number) {
    return this.messageRepository.findById(id);
  }
}
