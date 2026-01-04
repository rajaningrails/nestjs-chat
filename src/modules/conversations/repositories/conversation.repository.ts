import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { IConversationRepository } from './conversation.repository.interface';
import { Conversation } from '../entities/conversation.entity';
import { toMySQLDate } from 'src/utils/helpers';

@Injectable()
export class ConversationRepository implements IConversationRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
  ) {}

  async findAll(limit = 20, offset = 0): Promise<Conversation[]> {
    return this.conversationRepository.find({
      take: limit,
      skip: offset,
      order: {
        created_at: 'DESC',
      },
    });
  }

  async findById(id: any): Promise<Conversation | null> {
    return this.conversationRepository.findOne({ where: { id } });
  }

  async save(conversationData: Partial<Conversation>): Promise<Conversation> {
    const conversation = this.conversationRepository.create(conversationData);
    return this.conversationRepository.save(conversation);
  }

  async update(
    id: number,
    conversationData: Partial<Conversation>,
  ): Promise<Conversation | null> {
    await this.conversationRepository.update(id, conversationData);
    return this.findById(id);
  }

  async upsert(
    convData: Partial<Conversation>,
    manager?: EntityManager,
  ): Promise<bigint> {
    const repo = manager
      ? manager.getRepository(Conversation)
      : this.conversationRepository;

    const existing = await repo.findOne({
      where: {
        school_id: convData.school_id!,
        type: convData.type!,
        group_id: convData.group_id!,
      },
    });

    if (existing) {
      return existing.id;
    }

    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(Conversation)
      .values(convData)
      .execute();

    return result.identifiers[0].id;
  }

  async updateLastMessage(
    conversationId: number,
    data: Partial<Conversation>,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(Conversation)
      : this.conversationRepository;

    await repo.update(conversationId, data);
  }

  async updateLastMessageSafe(data: {
    conversationId: number;
    messageId: string;
    message: string | null;
    sender_id: number;
    receiver_id: number;
    createdAt: Date;
  }) {
    const createdAt = toMySQLDate(data.createdAt);
    await this.conversationRepository
      .createQueryBuilder()
      .update(Conversation)
      .set({
        last_message_id: data.messageId as any,
        last_message: data.message ?? 'Attachment',
        last_message_sender_id: data.sender_id,
        last_message_receiver_id: data.receiver_id,
        updated_at: data.createdAt,
      })
      .where('id = :id', { id: data.conversationId })
      .andWhere('(updated_at IS NULL OR updated_at <= :createdAt)', {
        createdAt,
      })
      .execute();
  }
}
