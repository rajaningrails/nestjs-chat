import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { IChatConfigRepositoryToken } from '../repositories/chat-config.repository.interface';
import { CreateChatConfigDto } from '../dto/chat-configs.dto';
import type { IChatConfigRepository } from "../repositories/chat-config.repository.interface";

@Injectable()
export class ChatConfigUseCase {
  constructor(
    @Inject(IChatConfigRepositoryToken)
    private readonly chatConfigRepository: IChatConfigRepository) {}

  async execute(request: CreateChatConfigDto): Promise<CreateChatConfigDto | null> {

    const existing = await this.chatConfigRepository.existing(request);
    if (existing) {
      return this.chatConfigRepository.update(request);
    }

    return this.chatConfigRepository.create(request);
  }
}