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
import { SocketService } from 'src/common/services/socket/socket.service';

@Injectable()
export class MessageService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly messageRepository: MessageRepository,
    private readonly userRepository: UserRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly socketService: SocketService,

    @InjectQueue('messages') private messageQueue: Queue,
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


  /**
   * Send message with proper error handling and optimistic updates
   */
  async sendMessage(dto: MessageDto) {
    const messageId = this.generateMessageId();
    const createdAt = new Date();

    const conversation = await this.conversationRepository.findById(
      dto.conversation_id
    );

    if (!conversation) {
      throw new Error('Conversation not found');
    }

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
      createdAt,
    };

    const queueData = {
      ...messageData,
      _conversationUpdate: {
        conversationId: dto.conversation_id,
        messageId,
        message: dto.message ?? null,
        sender_id: dto.sender_id,
        receiver_id: dto.receiver_id,
        createdAt,
      },
    };

    try {
      const job = await this.messageQueue.add('save-message', queueData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      const recipients: number[] = [];

      if (dto.receiver_id) {
        recipients.push(dto.receiver_id);
      } else if (dto.group_id) {
        // const groupMembers = await this.conversationRepository
        //   .getGroupMembers(dto.group_id);

        // recipients.push(
        //   ...groupMembers
        //     .filter(memberId => memberId !== dto.sender_id)
        // );
      }

      const emitResults = await Promise.allSettled([
        this.socketService.emitToUser(
          dto.sender_id,
          'message:sent',
          {
            ...messageData,
            status: 'pending',
            jobId: job.id,
          }
        ),
        ...recipients.map(recipientId =>
          this.socketService.emitToUser(
            recipientId,
            'message:received',
            {
              ...messageData,
              status: 'pending',
            }
          )
        ),
      ]);


      return {
        id: Number(dto.conversation_id),
        user_id: dto.receiver_id,
        school_id: dto.school_id,
        receiver_id: dto.receiver_id,
        group_id: dto.group_id ?? null,
        type: dto.group_id ? ConversationType.GROUP : ConversationType.USER,
        last_message_id: messageId,
        last_message: dto.attachments ? 'Sent an attachment' : dto.message,
        last_message_sender_id: dto.sender_id,
        last_message_receiver_id: dto.receiver_id ?? null,
        last_message_seen_at: null,
        last_message_date: createdAt,
        attachments: dto.attachments,
        createdAt,
        updatedAt: createdAt,
        is_only_teachers_group: null,
        group_name: '',
        group_image: '',
      };
    } catch (error) {

      await this.socketService.emitToUser(
        dto.sender_id,
        'message:error',
        {
          tempId: messageId,
          error: 'Failed to send message',
        }
      );

      throw error;
    }
  }


  async onMessageSaved(messageId: string, success: boolean, error?: string) {
    try {
      const message = await this.messageRepository.findById(messageId);

      if (!message) {
        return;
      }

      const recipients: number[] = [message.sender_id];

      if (message.receiver_id) {
        recipients.push(message.receiver_id);
      } else if (message.group_id) {
        // const groupMembers = await this.conversationRepository
        //   .getGroupMembers(message.group_id);
        // recipients.push(...groupMembers);
      }

      if (success) {
        await this.socketService.emitToUsers(
          recipients,
          'message:confirmed',
          {
            id: messageId,
            conversation_id: message.conversation_id,
            status: 'sent',
            saved_at: new Date(),
          }
        );
      } else {
        await this.socketService.emitToUser(
          message.sender_id,
          'message:failed',
          {
            id: messageId,
            conversation_id: message.conversation_id,
            error: error || 'Failed to save message',
          }
        );
      }
    } catch (err) {
    }
  }


  async markMessageAsSeen(
    messageId: string,
    userId: number
  ): Promise<void> {
    try {
      const message = await this.messageRepository.findById(messageId);

      if (!message) {
        throw new Error('Message not found');
      }

      if (message.receiver_id !== userId) {
        throw new Error('Unauthorized');
      }

      await this.messageRepository.markAsSeen(messageId);

      await this.socketService.emitToUser(
        message.sender_id,
        'message:seen',
        {
          message_id: messageId,
          conversation_id: message.conversation_id,
          seen_by: userId,
          seen_at: new Date(),
        }
      );
    } catch (error) {
      throw error;
    }
  }

  async emitTypingIndicator(
    conversationId: number,
    userId: number,
    isTyping: boolean
  ): Promise<void> {
    try {
      const conversation = await this.conversationRepository.findById(conversationId);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (conversation.type === ConversationType.USER) {
        const recipientId = conversation.school_id === userId
          ? conversation.last_message_receiver_id
          : conversation.last_message_sender_id;

        if (recipientId) {
          await this.socketService.emitToUser(
            recipientId,
            'typing',
            {
              conversation_id: conversationId,
              user_id: userId,
              is_typing: isTyping,
            }
          );
        }
      } else if (conversation.type === ConversationType.GROUP) {
        const roomId = `conversation:${conversationId}`;
        await this.socketService.emitToRoom(
          roomId,
          'typing',
          {
            conversation_id: conversationId,
            user_id: userId,
            is_typing: isTyping,
          },
          userId
        );
      }
    } catch (error) {
    }
  }


  async getUndeliveredMessages(userId: number): Promise<Message[]> {
    try {
      return await this.messageRepository.findUndeliveredForUser(userId);
    } catch (error) {
      return [];
    }
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
