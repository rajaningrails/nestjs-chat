import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Inject,
  ParseUUIDPipe,
  Delete,
} from '@nestjs/common';
import type { IMessageRepository } from './repositories/message.repository.interface';
import { IMessageRepositoryToken } from './repositories/message.repository.interface';
import { MessageService } from './services/message.service';
import { MessageDto } from './dto/message.dto';
import { SkipThrottle } from '@nestjs/throttler';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('messages')
export class MessageController {
  constructor(
    @Inject(IMessageRepositoryToken)
    private readonly messageRepository: IMessageRepository,
    private readonly messageService: MessageService,
  ) {}

  @SkipThrottle()
  @Post('send')
  async sendMessage(@Body() dto: MessageDto) {
    return this.messageService.sendMessage(dto);
  }

  @Post('create-message')
  async createMessageConnection(@Body() dto: CreateMessageDto) {
    return this.messageService.createMessageConnection(dto);
  }

  // @Post('seen')
  // async markAsSeen(@Body() dto: MarkSeenDto) {
  //   return this.messageService.markMessageAsSeen(dto);
  // }

  @Get()
  async getMessages(
    @Query('sender_id') senderId: number,
    @Query('receiver_id') receiverId?: number,
    @Query('group_id') groupId?: number,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.messageService.getMessages(
      +senderId,
      receiverId ? +receiverId : undefined,
      groupId ? +groupId : undefined,
      +limit,
      +offset,
    );
  }

  
  @Delete(':id')
  async deleteMessage(
    @Param('id') messageId: string,
    @Query('user_id') userId: number,
  ) {
    return this.messageService.deleteMessage(messageId, +userId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: number) {
    return this.messageRepository.findById(id);
  }
}
