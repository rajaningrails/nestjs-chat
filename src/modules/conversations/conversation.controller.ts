import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  Post,
  NotFoundException,
  Body,
} from '@nestjs/common';
import { ConversationRepository } from './repositories/conversation.repository';
import { Conversation } from './entities/conversation.entity';
import { ConversationType } from './dto/conversations.enum';
import { SocketService } from 'src/common/services/socket/socket.service';
import { DeleteConversationDto } from './dto/conversation-delete.dto';
import { UsersService } from '../users/services/users.service';
import { GroupRepository } from '../group/repositories/group.repository';

@Controller()
export class ConversationController {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly groupRepository: GroupRepository,
    private readonly socketService: SocketService,
    private readonly userService: UsersService,
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

  // @Get('conversation')
  // async findOne(
  //   @Query('id') conversation_id: number,
  // ) {
  //   return this.conversationRepository.getConversationMessages(conversation_id);
  // }

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
    const conversationExists = await this.conversationRepository.findById(
      request.conversationID!,
    );

    if (!conversationExists) {
      throw new NotFoundException('Conversation not found!');
    }

    const userDetail = await this.userService.findUserById(request.senderID!);
    if (!userDetail) {
      throw new NotFoundException('Sender not found!');
    }

    const messageData = {
      conversationID: request.conversationID!,
      senderID: request.senderID,
      receiverID: request.receiverID,
      groupID: request.groupID,
      senderName: userDetail.name,
      senderImage: userDetail.image,
    };

    await this.conversationRepository.softDelete(request.conversationID!);
    if (Number(request.groupID)) {
      await this.groupRepository.softDelete(Number(request.groupID));
      await this.socketService.emitToGroupMembers(
        Number(request.groupID),
        'allMessagesDeleted',
        messageData,
      );
    } else {
      await this.socketService.emitToUsers(
        [Number(request.receiverID), Number(request.senderID)],
        'allMessagesDeleted',
        messageData,
      );
    }
    return {
      success: true,
      message: 'Conversation deleted successfully',
    };
  }

  @Get('conversation')
  async getConversationMessages(
    @Query('id') conversation_id: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 25,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    return this.conversationRepository.getConversationMessages(
      conversation_id,
      limit,
      page,
    );
  }
}
