import Conversation from '../entities/conversation.entity';

export const IConversationRepositoryToken = Symbol('IConversationRepository');

export interface IConversationRepository {
  findAll(
    limit?: number,
    offset?: number,
  ): Promise<Conversation[]>;

  findById(id: string): Promise<Conversation | null>;

  save(conversationData: Partial<Conversation>): Promise<Conversation>;

  update(
    id: string,
    conversationData: Partial<Conversation>,
  ): Promise<Conversation | null>;
}
