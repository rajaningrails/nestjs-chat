import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ConversationDto } from './dto/conversation.dto';
import { ConversationRepository } from './repositories/conversation.repository';

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  @Post()
  async create(@Body() conversation: ConversationDto) {
    return this.conversationRepository.save(conversation);
  }

  @Get()
  async findAll(
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ) {
    return this.conversationRepository.findAll(limit, offset);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.conversationRepository.findById(id);
  }
}
