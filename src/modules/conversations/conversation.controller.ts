import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  Delete,
} from '@nestjs/common';
import { ConversationRepository } from './repositories/conversation.repository';
import { Conversation } from './entities/conversation.entity';
import { ConversationType } from './dto/conversations.enum';

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  @Get('latest-conversation')
  async findAll(
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('school_id', new ParseIntPipe({ optional: true })) school_id = 1,
    @Query('user_id', new ParseIntPipe({ optional: true })) user_id = 1,
    @Query('search') search: string,
  ): Promise<Conversation[]> {
    return this.conversationRepository.latestConversations(
      limit,
      page,
      school_id,
      user_id,
      search,
    );
  }

  @Get('/conversation-info')
  async findOne(
    @Query('conversation_id') conversation_id: string,
  ): Promise<Conversation | null> {
    return this.conversationRepository.findById(conversation_id);
  }

  @Get('searchConversation')
  async findBySearch(
    @Query('school_id') school_id: number,
    @Query('receiver_id') receiver_id: number,
    @Query('sender_id') sender_id: number,
    @Query('type') type: ConversationType,
  ): Promise<{
    conversation_exists: boolean;
    data: any;
    message: string;
  }> {
    return this.conversationRepository.findConversation(
      school_id,
      sender_id,
      receiver_id,
      type,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.conversationRepository.softDelete(id);
  }

  @Get()
  async getConversationMessages(
    @Query('conversation_id') conversation_id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 25,
    @Query('offset', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    return this.conversationRepository.getConversationMessages(
      conversation_id,
      limit,
      page,
    );
  }
}
