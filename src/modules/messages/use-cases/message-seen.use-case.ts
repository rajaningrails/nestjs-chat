import { Injectable } from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { SeenMessageDto } from '../dto/seen-message.dto';
import { SocketService } from 'src/common/services/socket/socket.service';
import { MessageRepository } from '../repositories/message.repository';

@Injectable()
export class MessageSeenUseCase {
  constructor(
    private readonly messageService: MessageService,
    private readonly socketService: SocketService,
    private readonly messageRepository: MessageRepository
  ) { }

  async execute(request: SeenMessageDto) {
    let response = {
      success: true,
      message: 'Group message seen status updated.',
      message_id: request.id,
      seen_at: new Date(),
      message_seen_receiver_id: request.seen_update_receiver_id,
      message_is_group: request.seen_update_receiver_id ? false : true,
      message_seen_update_seen_at: new Date(),
      message_seen_update_message_id: request.id,
      message_seen_update_sender_id: request.seen_update_sender_id,
      message_seen_update_conversationId: request.conversation_id,
      message_seen_update_receiver_id: request.seen_update_receiver_id,
      conversation_id: request.conversation_id
    }
    if (!request.seen_update_receiver_id) {
      await this.messageService.groupChatMessageSeen(request);
      const messageDetail = await this.messageRepository.findById(request.id);
      this.socketService.emitToGroupMembers(messageDetail?.group_id!, 'message-seen', response)
    } else {
      await this.messageService.oneToOneChatMessageSeen(request);
      this.socketService.emitToUser(request.seen_update_receiver_id, 'message-seen', response)
    }
    return response
  }
}
