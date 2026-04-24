import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IChatConfigRepository } from './chat-config.repository.interface';
import { CreateChatConfigDto } from '../dto/chat-configs.dto';
import { ChatConfig } from '../entities/chat-configs.entity';

@Injectable()
export class ChatConfigRepository implements IChatConfigRepository {
  constructor(
    @InjectRepository(ChatConfig)
    private readonly chatConfigRepository: Repository<CreateChatConfigDto>,
  ) {}

  async existing(request: Partial<CreateChatConfigDto>): Promise<CreateChatConfigDto | null> {
    return await this.chatConfigRepository.findOne({ where: { user_id: request.user_id, feature_key: request.feature_key } });
  }

  async create(payload: CreateChatConfigDto): Promise<CreateChatConfigDto> {
    const chatConfig = this.chatConfigRepository.create(payload);
    return this.chatConfigRepository.save(chatConfig);
  }

  async update(payload: CreateChatConfigDto): Promise<CreateChatConfigDto | null> {
    await this.chatConfigRepository.update({ user_id: payload.user_id }, payload);
    return this.existing(payload);
  }
}
