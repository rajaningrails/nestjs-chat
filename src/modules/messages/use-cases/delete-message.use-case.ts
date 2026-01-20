import { Injectable, Inject } from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { DeleteMessageDto } from '../dto/delete-message.dto';

@Injectable()
export class DeleteMessageUseCase {
  constructor(
    private readonly messageService: MessageService,
  ) {}

  async execute(request: DeleteMessageDto) {
    console.log(request);
    await this.messageService.deleteMessage(request.messageId);
    return {
      messageId: request.messageId,
      conversationId: request.conversationID,
      receiverId: request.receiverID,
      senderId: request.senderID,
    };
  }
}
