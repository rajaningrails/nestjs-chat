import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { ConversationRepository } from './repositories/conversation.repository';
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
    @Query('conversationId') conversationId: number,
  ): Promise<{
    conversation_exists: boolean;
    data: any;
    message: string;
  }|null> {
    return this.conversationRepository.findConversation(
      school_id,
      conversationId
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
