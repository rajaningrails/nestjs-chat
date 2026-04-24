import { Inject, Injectable } from '@nestjs/common';
import { IChatConfigRepositoryToken } from '../repositories/chat-config.repository.interface';
import type { IChatConfigRepository } from '../repositories/chat-config.repository.interface';
import { CreateChatConfigDto } from '../dto/chat-configs.dto';

@Injectable()
export class GetChatConfigUseCase {
  constructor(
    @Inject(IChatConfigRepositoryToken)
    private readonly chatConfigRepository: IChatConfigRepository,
  ) {}

  async execute(user_id: string | number): Promise<CreateChatConfigDto[]> {
    return await this.chatConfigRepository.findBy(user_id?.toString());
  }
}
