import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Message } from '../entities/message.entity';
import { IMessageRepository } from './message.repository.interface';
import { CreateMessageDto } from '../dto/create-message.dto';

@Injectable()
export class MessageRepository implements IMessageRepository {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

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
      take: limit,
      skip: offset,
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: any): Promise<Message | null> {
    return this.messageRepository.findOne({
      where: { id },
      withDeleted: false,
    });
  }

  async save(messageData: Partial<CreateMessageDto>): Promise<Message> {
    const message = this.messageRepository.create(messageData);
    return this.messageRepository.save(message);
  }

  async countConversationMessage(conversationId: string): Promise<number> {
    return this.messageRepository.count({
      where: { conversation_id: conversationId },
    });
  }

  async getConversationMessages(
    conversation_id: string,
    limit = 25,
    offset = 0,
  ): Promise<Message[]> {
    return await this.messageRepository
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.sender', 'sender')
      .leftJoinAndSelect('m.receiver', 'receiver')
      .leftJoinAndSelect('m.attachments', 'attachments')
      .where('m.conversation_id = :conversation_id', { conversation_id })
      .orderBy('m.created_at', 'DESC')
      .take(limit)
      .skip(offset)
      .getMany();
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

  async update(
    id: string,
    messageData: Partial<Message>,
  ): Promise<Message | null> {
    await this.messageRepository.update(id, messageData);
    return this.findById(id);
  }

  async markAsSeen(id: string, seenAt: Date = new Date()): Promise<void> {
    await this.messageRepository.update(id, { seen_at: seenAt });
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.messageRepository.softDelete(id);
    return !!result.affected;
  }

  async deleteBatch(ids: string[]): Promise<void> {
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
        .andWhere('message.message ILIKE :query', { query: `%${query}%` })
        .andWhere('message.deleted_at IS NULL')
        .orderBy('message.created_at', 'DESC')
        .limit(limit)
        .getMany();
    } catch (error) {
      return [];
    }
  }

  async cleanupOldMessages(daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.messageRepository
        .createQueryBuilder()
        .delete()
        .from(Message)
        .where('deleted_at IS NOT NULL')
        .andWhere('deleted_at < :cutoffDate', { cutoffDate })
        .execute();

      return result.affected || 0;
    } catch (error) {
      return 0;
    }
  }
}
