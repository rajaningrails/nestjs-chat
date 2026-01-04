import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageRepository } from '../repositories/message.repository';
import { MessageDto } from '../dto/message.dto';
import { MessageGateway } from '../gateway/message.gateway';

@Injectable()
export class MessageService {
  constructor(
    private readonly messageRepository: MessageRepository,
    @InjectQueue('messages') private messageQueue: Queue,
    private readonly messageGateway: MessageGateway,
  ) {}

  async sendMessage(dto: MessageDto) {
    const messageId = this.generateMessageId();
    
    const messageData = {
      id: messageId,
      sender_id: dto.sender_id,
      receiver_id: dto.receiver_id || null,
      group_id: dto.group_id || null,
      conversation_id: dto.conversation_id,
      message: dto.message,
      images: dto.attachments || null,
      message_type: dto.message_type || 'text',
      createdAt: new Date(),
    };

    // 1. Emit to WebSocket clients immediately (real-time)
    // this.messageGateway.emitNewMessage(messageData);

    // 2. Queue for DB persistence (async)
    await this.messageQueue.add('save-message', messageData, {
      priority: 1, // High priority
    });

    return {
      id: messageId,
      status: 'sent',
      timestamp: messageData.createdAt,
    };
  }

//   async markMessageAsSeen(dto: MarkSeenDto) {
//     const seenData = {
//       message_id: dto.message_id,
//       user_id: dto.user_id,
//       seenAt: new Date(),
//     };

//     // 1. Emit to WebSocket (instant feedback)
//     this.messageGateway.emitMessageSeen(seenData);

//     // 2. Queue for DB update
//     await this.messageQueue.add('mark-seen', seenData, {
//       priority: 2, // Lower priority than new messages
//     });

//     return { status: 'seen', timestamp: seenData.seenAt };
//   }

  async getMessages(
    senderId: number,
    receiverId?: number,
    groupId?: number,
    limit = 20,
    offset = 0,
  ) {
    return this.messageRepository.findByConversation(
      senderId,
      receiverId,
      groupId,
      limit,
      offset,
    );
  }

  async deleteMessage(messageId: string, userId: number) {
    // Verify ownership
    const message = await this.messageRepository.findById(messageId);
    if (!message || message.sender_id !== userId) {
      throw new Error('Unauthorized or message not found');
    }

    // Queue for soft delete
    await this.messageQueue.add('delete-message', {
      message_id: messageId,
      deleted_by: userId,
    });

    // Emit deletion event
    // this.messageGateway.emitMessageDeleted({
    //   message_id: messageId,
    //   conversation_id: message.conversation_id!,
    // });

    return { status: 'deleted' };
  }

  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}