import { Inject, Injectable } from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { SeenMessageDto } from '../dto/seen-message.dto';
import { IMessageRepositoryToken } from '../repositories/message.repository.interface';
import { MessageRepository } from '../repositories/message.repository';

@Injectable()
export class MessageSeenUseCase {
  constructor(
    @Inject(IMessageRepositoryToken)
    private readonly messageRepository: MessageRepository,
    private readonly messageService: MessageService,
  ) {}

  async execute(request: SeenMessageDto) {
    const messageExists = await this.messageRepository.findById(
      request.messageId,
    );
    if (!messageExists) {
      throw new Error('Message not found');
    }
    if (messageExists.group_id) {
      await this.messageService.groupChatMessageSeen(request.messageId);
    } else {
      await this.messageService.oneToOneChatMessageSeen(request.messageId);
    }
    return {
      messageId: request.messageId,
      conversationId: messageExists.conversation_id,
      receiverId: messageExists.receiver_id,
      senderId: messageExists.sender_id,
    };
  }
}
