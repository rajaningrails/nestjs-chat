import { Message } from '../entities/message.entity';

export const IMessageRepositoryToken = Symbol('IMessageRepository');

export interface IMessageRepository {
  findByConversation(
    senderId: number,
    receiverId?: number,
    groupId?: number,
    limit?: number,
    offset?: number,
  ): Promise<Message[]>;

  findById(id: number): Promise<Message | null>;

  save(messageData: Partial<Message>): Promise<Message>;

  update(
    id: string,
    messageData: Partial<Message>,
  ): Promise<Message | null>;

  markAsSeen(id: string, seenAt?: Date): Promise<void>;

  softDelete(id: string): Promise<boolean>;
}
