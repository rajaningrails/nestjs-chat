import { CreateChatConfigDto } from '../dto/chat-configs.dto';
import { ChatConfig } from '../entities/chat-configs.entity';

export const IChatConfigRepositoryToken = Symbol('IChatConfigRepository');
export interface IChatConfigRepository {
  existing(
    request: Partial<CreateChatConfigDto>,
  ): Promise<CreateChatConfigDto | null>;
  create(userData: CreateChatConfigDto): Promise<CreateChatConfigDto>;
  update(userData: CreateChatConfigDto): Promise<CreateChatConfigDto | null>;
  findBy(request: string): Promise<CreateChatConfigDto[]>;
}
