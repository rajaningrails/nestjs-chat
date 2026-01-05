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

  async findByUserId(userId: number): Promise<Conversation[]> {
    try {
      const conversations = await this.conversationRepository.query(
        `
        SELECT DISTINCT c.*
        FROM conversations c
        LEFT JOIN chat_group_members gm ON gm.group_id = c.group_id
        WHERE ( 
          c.last_message_sender_id = $1
          OR c.last_message_receiver_id = $1 
          OR gm.user_id = $1
        )
        AND c.deleted_at IS NULL
        ORDER BY c.updated_at DESC
        `,
        [userId],
      );

      return conversations;
    } catch (error) {
      return [];
    }
  }

  async findConversationGroupMemberIds(
    conversationId: number,
  ): Promise<number[]> {
    const conversation = await this.conversationRepository
      .createQueryBuilder('conversation')
      .innerJoin('conversation.group', 'group')
      .innerJoin('group.members', 'member')
      .select('member.user_id')
      .where('conversation.id = :conversationId', { conversationId })
      .andWhere('conversation.deleted_at IS NULL')
      .getRawMany();

    return conversation.map((row) => row.member_user_id);
  }

  async softDelete(conversationId: number): Promise<boolean> {
    try {
      await this.conversationRepository.update(conversationId, {
        deleted_at: new Date(),
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async findConversation(
    school_id: number,
    sender_id: number,
    receiver_id: number | null,
    type: 'group' | 'user',
  ): Promise<Conversation[]> {
    try {
      const conversations = await this.conversationRepository.query(
        `
      SELECT DISTINCT c.*
      FROM conversations c

      LEFT JOIN group_members gm 
        ON gm.group_id = c.group_id

      LEFT JOIN users u 
        ON c.type = 'user'
        AND (
          (c.last_message_sender_id = u.id AND u.id != $2)
          OR
          (c.last_message_receiver_id = u.id AND u.id != $2)
        )

      WHERE c.school_id = $1
        AND c.type = $3
        AND c.deleted_at IS NULL

        AND (
          c.last_message_sender_id = $2
          OR c.last_message_receiver_id = $2
          OR gm.user_id = $2
        )

        AND (
          $4::int IS NULL
          OR c.last_message_sender_id = $4
          OR c.last_message_receiver_id = $4
        )

      ORDER BY c.last_message_date DESC NULLS LAST
      `,
        [
          school_id, 
          sender_id, 
          type, 
          receiver_id,
        ],
      );

      return conversations;
    } catch (error) {
      console.error('findConversation error:', error);
      return [];
    }
  }

  async cleanupOldDeletedConversations(daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await this.conversationRepository
        .createQueryBuilder()
        .delete()
        .from(Conversation)
        .where('deleted_at IS NOT NULL')
        .andWhere('deleted_at < :cutoffDate', { cutoffDate })
        .execute();

      return result.affected || 0;
    } catch (error) {
      return 0;
    }
  }
}
