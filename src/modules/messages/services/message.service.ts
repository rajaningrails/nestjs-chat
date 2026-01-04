import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageRepository } from '../repositories/message.repository';
import { MessageDto } from '../dto/message.dto';
import { MessageGateway } from '../gateway/message.gateway';
import { CreateMessageDto } from '../dto/create-message.dto';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';
import { ConversationType } from 'src/modules/conversations/dto/conversations.enum';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../entities/message.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class MessageService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly messageRepository: MessageRepository,
    private readonly userRepository: UserRepository,
    private readonly conversationRepository: ConversationRepository,

    @InjectQueue('messages') private messageQueue: Queue,
    private readonly messageGateway: MessageGateway,
  ) {
  }

  async createMessageConnection(dto: CreateMessageDto) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      await this.userRepository.upsertUser(
        {
          school_id: dto.school_id,
          user_id: dto.sender_id,
          name: dto.sender_name,
          image: dto.sender_image,
          type: dto.sender_user_type,
        },
        manager,
      );

      await this.userRepository.upsertUser(
        {
          school_id: dto.school_id,
          user_id: dto.receiver_id,
          name: dto.receiver_name,
          image: dto.receiver_image,
          type: dto.receiver_user_type,
        },
        manager,
      );

      const conversationId = await this.conversationRepository.upsert(
        {
          school_id: dto.school_id,
          created_at: new Date(),
          group_id: null,
          group_type: null,
          type: ConversationType.USER,
          updated_at: new Date(),
          last_message_receiver_id: dto.receiver_id,
          last_message_sender_id: dto.sender_id,
        },
        manager,
      );

      const messageId = this.generateMessageId();

      await manager.getRepository(Message).save({
        id: messageId,
        school_id: dto.school_id,
        sender_id: dto.sender_id,
        receiver_id: dto.receiver_id,
        conversation_id: conversationId,
        message: dto.message ?? null,
        attachments: null,
        createdAt: new Date(),
      });

      await this.conversationRepository.updateLastMessage(
        conversationId as any,
        {
          last_message_id: messageId as any,
          last_message: dto.message ?? 'Attachment',
          last_message_sender_id: dto.sender_id,
          last_message_receiver_id: dto.receiver_id,
          updated_at: new Date(),
        },
        manager,
      );

      await queryRunner.commitTransaction();
      return {
        id: Number(conversationId),
        user_id: dto.receiver_id,
        school_id: dto.school_id,
        receiver_id: dto.receiver_id,
        group_id: null,
        type: ConversationType.USER,
        last_message_id: messageId,
        last_message: dto.message ?? 'Sent an attachment',
        last_message_sender_id: dto.sender_id,
        last_message_receiver_id: dto.receiver_id ?? null,
        last_message_seen_at: null,
        last_message_date: new Date(),
        attachments: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        last_message_receiver_type: dto.receiver_user_type,
        is_only_teachers_group: null,
        last_message_sender_type: dto.sender_user_type,
        group_name: '',
        group_image: '',
        user_details: {
          name: dto.sender_name,
          image: dto.sender_image,
          level: dto.sender_user_type,
          id: dto.sender_id,
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async sendMessage(dto: MessageDto) {
    const messageId = this.generateMessageId();

    const messageData = {
      id: messageId,
      school_id: dto.school_id,
      sender_id: dto.sender_id,
      receiver_id: dto.receiver_id,
      group_id: dto.group_id,
      seen_at: null,
      conversation_id: dto.conversation_id,
      message: dto.message ?? null,
      attachments: dto.attachments,
      createdAt: new Date(),
    };

    await this.messageQueue.add('save-message', {
      ...messageData,
      _conversationUpdate: {
        conversationId: dto.conversation_id,
        messageId,
        message: dto.message,
        sender_id: dto.sender_id,
        receiver_id: dto.receiver_id,
        createdAt: new Date(),
      },
    });

    return {
      id: Number(dto.conversation_id),
      user_id: dto.receiver_id,
      school_id: dto.school_id,
      receiver_id: dto.receiver_id,
      group_id: null,
      type: ConversationType.USER,
      last_message_id: messageId,
      last_message: dto.attachments ? 'Sent an attachment' : dto.message,
      last_message_sender_id: dto.sender_id,
      last_message_receiver_id: dto.receiver_id ?? null,
      last_message_seen_at: null,
      last_message_date: new Date(),
      attachments: dto.attachments,
      createdAt: new Date(),
      updatedAt: new Date(),
      is_only_teachers_group: null,
      group_name: '',
      group_image: '',
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
    return uuidv4();
  }
}
