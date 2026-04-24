import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CreateChatConfigDto } from './dto/chat-configs.dto';
import { ChatConfigUseCase } from './use-cases/chat-config.use-case';
import { Repository } from 'typeorm';
import { ChatConfig } from './entities/chat-configs.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Controller()
export class ChatConfigController {
  constructor(
    private readonly chatConfigUseCase: ChatConfigUseCase,

    @InjectRepository(ChatConfig)
    private readonly chatConfigRepository: Repository<ChatConfig>,
  ) {}

  @Post('change-chat-configs')
  async update(
    @Body() payload: CreateChatConfigDto,
  ): Promise<CreateChatConfigDto | null> {
    const response = await this.chatConfigUseCase.execute(payload);
    return response;
  }

  @Get('chat-configs')
  async get(
    @Query('user_id') user_id: string,
  ): Promise<ChatConfig[]> {
    return this.chatConfigRepository.findBy({
      user_id: user_id,
    });
  }
}
