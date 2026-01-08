import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ConversationRepository } from './repositories/conversation.repository';
import { Conversation } from './entities/conversation.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  @Post()
  async create(@Body() conversation: CreateConversationDto): Promise<Conversation> {
    return this.conversationRepository.save(conversation);
  }

  @Get()
  async findAll(
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ): Promise<Conversation[]> {
    return this.conversationRepository.findAll(limit, offset);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Conversation | null> {
    return this.conversationRepository.findById(id);
  }
}
