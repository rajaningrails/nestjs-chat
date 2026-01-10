import { Injectable, Logger } from '@nestjs/common';
import { ConversationRepository } from '../repositories/conversation.repository';
import { DataSource } from 'typeorm';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { Conversation } from '../entities/conversation.entity';
import { InjectQueue } from '@nestjs/bullmq';
import { ConversationProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { Queue } from 'bullmq';
import { UpdateConversationDto } from '../dto/update-conversation.dto';

interface UserContact {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly dataSource: DataSource,
    @InjectQueue(ConversationProcessorConfig.queue_name)
    private conversationQueue: Queue,
  ) {}

  async createConversation(
    request: CreateConversationDto,
  ): Promise<Conversation> {
    const data: CreateConversationDto = {
      ...request,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await this.conversationQueue.add('save-conversation', data);
    return { ...data } as Conversation;
  }

  async createConversations(
    payload: CreateConversationDto[],
  ): Promise<Conversation[]> {
    const payloads = payload.map((create) => ({
      ...create,
      created_at: new Date(),
      updated_at: new Date(),
    }));
    const jobs = payloads.map((data) => ({
      name: 'save-conversation',
      data,
    }));

    await this.conversationQueue.addBulk(jobs);
    return payloads as Conversation[];
  }

  async updateConversation(payload: UpdateConversationDto): Promise<Conversation> {
    const data = {
      ...payload,
      updated_at: new Date(),
    };
    await this.conversationQueue.add('update-conversation', data);
    return { ...data } as Conversation;
  }

  async updateConversations(updates: Array<UpdateConversationDto>): Promise<Conversation[]> {
    const payloads = updates?.map((update) => ({
      ...update,
      updated_at: new Date(),
    }));
    const jobs = updates.map((update) => ({
      name: 'update-conversation',
      data: update,
    }));
    await this.conversationQueue.addBulk(jobs);
    return payloads as Conversation[];
  }

  async getUserConversations(userId: number) {
    try {
      return await this.conversationRepository.findByUserId(userId);
    } catch (error) {
      throw error;
    }
  }

  async getUserContacts(userId: number): Promise<UserContact[]> {
    try {
      const conversations =
        await this.conversationRepository.findByUserId(userId);

      const contactIds = new Set<number>();

      for (const conversation of conversations) {
        if (conversation.type === 'user') {
          if (conversation.last_message_sender_id !== userId) {
            contactIds.add(conversation.last_message_sender_id!);
          }
          if (
            conversation.last_message_receiver_id &&
            conversation.last_message_receiver_id !== userId
          ) {
            contactIds.add(conversation.last_message_receiver_id);
          }
        } else if (conversation.type === 'group' && conversation.group_id) {
          const groupMembers = await this.getGroupMembers(
            conversation.group_id,
          );
          groupMembers.forEach((memberId) => {
            if (memberId !== userId) {
              contactIds.add(memberId);
            }
          });
        }
      }

      if (contactIds.size === 0) {
        return [];
      }

      const contacts = await this.dataSource.query(
        `
                SELECT 
                id,
                name,
                email,
                avatar
                FROM users
                WHERE id = ANY($1)
                `,
        [Array.from(contactIds)],
      );

      return contacts;
    } catch (error) {
      this.logger.error(`Failed to get contacts for user ${userId}:`, error);
      return [];
    }
  }

  async getGroupMembers(groupId: string): Promise<number[]> {
    try {
      const members = await this.dataSource.query(
        `
        SELECT user_id 
        FROM group_members 
        WHERE group_id = $1 AND deleted_at IS NULL
        `,
        [groupId],
      );

      return members.map((m: any) => m.user_id);
    } catch (error) {
      this.logger.error(
        `Failed to get group members for group ${groupId}:`,
        error,
      );
      return [];
    }
  }

  async deleteConversation(conversationId: string) {
    try {
      await this.dataSource.query(
        `
                    UPDATE conversations
                    SET deleted_at = NOW()
                    WHERE id = $1
                `,
        [conversationId],
      );

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Failed to delete conversation ${conversationId}:`,
        error,
      );
      throw error;
    }
  }
}
