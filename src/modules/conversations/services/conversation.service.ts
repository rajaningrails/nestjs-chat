import { Injectable, Logger } from '@nestjs/common';
import { ConversationRepository } from '../repositories/conversation.repository';
import { DataSource } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly dataSource: DataSource,
  ) {}
  async getUserConversations(userId: number) {
    try {
      return await this.conversationRepository.findByUserId(userId);
    } catch (error) {
      throw error;
    }
  }

  async getGroupMembers(groupId: number): Promise<number[]> {
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

  async deleteConversation(conversationId: number) {
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

  async upsertBatch(conversations: Conversation[]){
    return this.conversationRepository.upsertBatch(conversations);
  }

  async findById(id: number): Promise<Conversation | null> {
    return this.conversationRepository.findById(id);
  }
}
