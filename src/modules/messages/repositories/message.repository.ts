import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Message } from '../entities/message.entity';
import { IMessageRepository } from './message.repository.interface';

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
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Message | null> {
    return this.messageRepository.findOne({
      where: { id },
    });
  }

  async save(messageData: Partial<Message>): Promise<Message> {
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
    await this.messageRepository.update(id, { seenAt });
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
      // Let the caller handle fallback if needed
      throw error;
    }
  }
}
