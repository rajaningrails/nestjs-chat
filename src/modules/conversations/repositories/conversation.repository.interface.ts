import { CreateConversationDto } from "../dto/create-conversation.dto";
import { UpdateConversationDto } from "../dto/update-conversation.dto";
import { Conversation } from "../entities/conversation.entity";

export const IConversationRepositoryToken = Symbol('IConversationRepository');

export interface IConversationRepository {
  findAll(
    limit?: number,
    offset?: number,
  ): Promise<Conversation[]>;

  findById(id: number): Promise<Conversation | null>;

  save(conversationData: Partial<CreateConversationDto>): Promise<Conversation>;

  update(
    id: number,
    conversationData: Partial<UpdateConversationDto>,
  ): Promise<Conversation | null>;
}
