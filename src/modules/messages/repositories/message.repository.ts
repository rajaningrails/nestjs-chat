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
  ) { }

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
    });
  }

  async save(messageData: Partial<CreateMessageDto>): Promise<Message> {
    const message = this.messageRepository.create(messageData);
    return this.messageRepository.save(message);
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


  async findUndeliveredForUser(userId: number): Promise<Message[]> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const messages = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.receiver_id = :userId', { userId })
        .andWhere('message.seen_at IS NULL')
        .andWhere('message.delivered_at IS NULL')
        .andWhere('message.created_at >= :sevenDaysAgo', { sevenDaysAgo })
        .andWhere('message.deleted_at IS NULL')
        .orderBy('message.created_at', 'ASC')
        .limit(100)
        .getMany();


      if (messages.length > 0) {
        const messageIds = messages.map(m => m.id);
        await this.markAsDelivered(messageIds);
      }

      return messages;
    } catch (error) {
      return [];
    }
  }

  async markAsDelivered(messageIds: string[]): Promise<void> {
    try {
      if (messageIds.length === 0) return;

      await this.messageRepository
        .createQueryBuilder()
        .update(Message)
        .set({ delivered_at: new Date() })
        .where('id IN (:...messageIds)', { messageIds })
        .execute();

    } catch (error) {
    }
  }

  async searchMessages(
    userId: number,
    query: string,
    limit: number = 50
  ): Promise<Message[]> {
    try {
      return await this.messageRepository
        .createQueryBuilder('message')
        .leftJoinAndSelect('message.conversation', 'conversation')
        .where(
          '(message.sender_id = :userId OR message.receiver_id = :userId)',
          { userId }
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
