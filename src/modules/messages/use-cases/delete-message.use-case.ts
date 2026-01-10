import { Injectable, Inject } from '@nestjs/common';
import { IMessageRepositoryToken } from '../repositories/message.repository.interface';
import { MessageService } from '../services/message.service';
import { DeleteMessageDto } from '../dto/delete-message.dto';

@Injectable()
export class DeleteMessageUseCase {
  constructor(
    @Inject(IMessageRepositoryToken)
    private readonly messageService: MessageService,
  ) {}

  async execute(request: DeleteMessageDto) {
    await this.messageService.deleteMessage(request.messageId);
    return {
      messageId: request.messageId,
      conversationId: request.conversationID,
      receiverId: request.receiverID,
      senderId: request.senderID,
    };
  }
}
