import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CreateChatConfigDto } from './dto/chat-configs.dto';
import { ChatConfigUseCase } from './use-cases/chat-config.use-case';
import { GetChatConfigUseCase } from './use-cases/get-chat-config.use-case';

@Controller()
export class ChatConfigController {
  constructor(
    private readonly chatConfigUseCase: ChatConfigUseCase,
    private readonly getChatConfigUseCase: GetChatConfigUseCase,
  ) {}

  @Post('change-chat-configs')
  async update(
    @Body() payload: CreateChatConfigDto,
  ): Promise<CreateChatConfigDto | null> {
    const response = await this.chatConfigUseCase.execute(payload);
    return response;
  }

  @Get('chat-configs')
  async get(@Query('user_id') user_id: string): Promise<CreateChatConfigDto[]> {
    return this.getChatConfigUseCase.execute(user_id);
  }
}
