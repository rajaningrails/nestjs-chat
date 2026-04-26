import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { ConversationRepository } from './repositories/conversation.repository';
import { ConversationType } from './dto/conversations.enum';
import { DeleteConversationDto } from './dto/conversation-delete.dto';

@Controller()
export class ConversationController {
  constructor(
    private readonly conversationRepository: ConversationRepository,
  ) {}

  @Get('latest-conversations')
  async findAll(
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('school_id', new ParseIntPipe({ optional: true })) school_id = 1,
    @Query('user_id', new ParseIntPipe({ optional: true })) user_id = 1,
    @Query('search') search: string,
  ) {
    return this.conversationRepository.latestConversations(
      limit,
      page,
      school_id,
      user_id,
      search,
    );
  }

  @Get('conversation-info')
  async find(@Query('conversation_id') conversation_id: number) {
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

  @Post('deleteAllMessages')
  async remove(@Body() request: DeleteConversationDto) {
    return this.conversationRepository.deleteAllMessages(request);
  }

  @Get('conversation')
  async getConversationMessages(
    @Query('id') conversation_id: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 25,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    const offset = (page - 1) * limit; 
    const response =
      await this.conversationRepository.getConversationMessagesWithBuffer(
        conversation_id,
        limit,
        offset,
      );
    return response;
  }
}
