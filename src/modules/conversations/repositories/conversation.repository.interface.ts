import { Conversation } from "../entities/conversation.entity";

export const IConversationRepositoryToken = Symbol('IConversationRepository');

export interface IConversationRepository {
  findAll(
    limit?: number,
    offset?: number,
  ): Promise<Conversation[]>;

  findById(id: number): Promise<Conversation | null>;

  save(conversationData: Partial<Conversation>): Promise<Conversation>;

  update(
    id: number,
    conversationData: Partial<Conversation>,
  ): Promise<Conversation | null>;
}
