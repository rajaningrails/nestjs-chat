import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';
import { IMessageRepository } from './message.repository.interface';
import { SendMessageDto } from '../dto/send-message.dto';

@Injectable()
export class MessageRepository implements IMessageRepository {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  private static readonly MAX_PAGE_SIZE = 100;

  async findByConversation(
    senderId: number,
    receiverId?: number,
    groupId?: number,
    limit = 20,
    offset = 0,
  ): Promise<Message[]> {
    const where: any = {};

    if (groupId) {
      where.group_id = groupId;
    } else {
      where.sender_id = senderId;
      where.receiver_id = receiverId;
    }

    return this.messageRepository.find({
      where,
      take: Math.min(limit, MessageRepository.MAX_PAGE_SIZE),
      skip: offset,
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: number): Promise<Message | null> {
    return this.messageRepository.findOne({
      where: { id: String(id) as any },
      withDeleted: false,
    });
  }

  async save(messageData: Partial<SendMessageDto>): Promise<Message> {
    const message = this.messageRepository.create({
      ...messageData,
      sender_id: messageData?.message_sender_id,
    });
    return this.messageRepository.save(message);
  }

  async countConversationMessage(conversationId: number): Promise<number> {
    return this.messageRepository.count({
      where: { conversation_id: conversationId },
    });
  }

  async getConversationMessages(
    conversation_id: number,
    limit = 25,
    offset = 0,
  ): Promise<Message[]> {
    return this.messageRepository.find({
      where: {
        conversation_id: Number(conversation_id),
      },
      relations: ['sender', 'receiver', 'group'],
      take: Math.min(limit, MessageRepository.MAX_PAGE_SIZE),
      skip: offset,
      order: { created_at: 'DESC' },
      withDeleted: true,
    });
  }

  async upsertBatch(messages: Message[]): Promise<void> {
    if (!messages.length) return;
    try {
      await this.messageRepository
        .createQueryBuilder()
        .insert()
        .into(Message)
        .values(messages)
        .orUpdate(['seen_at', 'deleted_at'], ['id'])
        .execute();
    } catch (error) {
      throw error;
    }
  }

  async oneToOneChatMessageSeenBatch(ids: number[]): Promise<void> {
    try {
      await this.messageRepository
        .createQueryBuilder()
        .update(Message)
        .set({ seen_at: new Date() })
        .where('id IN (:...ids)', { ids })
        .execute();
    } catch (error) {
      throw error;
    }
  }

  async update(
    id: number,
    messageData: Partial<Message>,
  ): Promise<Message | null> {
    await this.messageRepository.update(id, messageData);
    return this.findById(id);
  }

  async markAsSeen(id: number, seenAt: Date = new Date()): Promise<void> {
    await this.messageRepository.update(id, { seen_at: seenAt });
  }

  async softDelete(id: number): Promise<boolean> {
    const result = await this.messageRepository.softDelete(id);
    return !!result.affected;
  }

  async deleteBatch(ids: number[]): Promise<void> {
    try {
      await this.messageRepository
        .createQueryBuilder()
        .softDelete()
        .where('id IN (:...ids)', { ids })
        .execute();
    } catch (error) {
      throw error;
    }
  }

  async saveBatch(messages: Partial<Message>[]): Promise<void> {
    if (messages.length === 0) return;

    try {
      await this.messageRepository
        .createQueryBuilder()
        .insert()
        .into(Message)
        .values(messages)
        .execute();
    } catch (error) {
      throw error;
    }
  }

  async searchMessages(
    userId: number,
    query: string,
    limit: number = 50,
  ): Promise<Message[]> {
    try {
      return await this.messageRepository
        .createQueryBuilder('message')
        .leftJoinAndSelect('message.conversation', 'conversation')
        .where(
          '(message.sender_id = :userId OR message.receiver_id = :userId)',
          { userId },
        )
        .andWhere('message.message LIKE :query', { query: `%${query}%` })
        .andWhere('message.deleted_at IS NULL')
        .orderBy('message.created_at', 'DESC')
        .limit(Math.min(limit, MessageRepository.MAX_PAGE_SIZE))
        .getMany();
    } catch {
      return [];
    }
  }

  async cleanupOldMessages(daysOld: number = 90, batchSize = 500): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let totalDeleted = 0;
    try {
      // Select IDs in batches then delete — avoids long table locks on large tables
      while (true) {
        const batch = await this.messageRepository
          .createQueryBuilder('message')
          .select('message.id')
          .where('message.deleted_at IS NOT NULL')
          .andWhere('message.deleted_at < :cutoffDate', { cutoffDate })
          .take(batchSize)
          .getMany();

        if (!batch.length) break;

        await this.messageRepository
          .createQueryBuilder()
          .delete()
          .from(Message)
          .whereInIds(batch.map((m) => m.id))
          .execute();

        totalDeleted += batch.length;
        if (batch.length < batchSize) break;
      }
    } catch {
      // Return how many were deleted before the error
    }
    return totalDeleted;
  }
}
