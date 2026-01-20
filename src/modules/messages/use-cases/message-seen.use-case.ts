import { Injectable } from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { SeenMessageDto } from '../dto/seen-message.dto';

@Injectable()
export class MessageSeenUseCase {
  constructor(
    private readonly messageService: MessageService,
  ) {}

  async execute(request: SeenMessageDto) {
    if (request.groupID) {
      await this.messageService.groupChatMessageSeen(request);
    } else {
      await this.messageService.oneToOneChatMessageSeen(request);
    }
    return {
      messageId: request.messageId,
      conversationId: request.conversationID,
      receiverId: request.receiverID,
      senderId: request.senderID,
      groupId: request.groupID,
    };
  }
}
