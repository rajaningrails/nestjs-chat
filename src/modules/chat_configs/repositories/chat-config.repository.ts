import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IChatConfigRepository } from './chat-config.repository.interface';
import { CreateChatConfigDto } from '../dto/chat-configs.dto';
import { ChatConfig } from '../entities/chat-configs.entity';
import Redis from 'ioredis';
import { RedisService } from 'src/common/services/redis.service';

@Injectable()
export class ChatConfigRepository implements IChatConfigRepository {
  constructor(
    @InjectRepository(ChatConfig)
    private readonly chatConfigRepository: Repository<CreateChatConfigDto>,
    private readonly redisService: RedisService,
  ) {}
  private get redis(): Redis {
    return this.redisService.getClient();
  }
  async existing(
    request: Partial<CreateChatConfigDto>,
  ): Promise<CreateChatConfigDto | null> {
    return await this.chatConfigRepository.findOne({
      where: { user_id: request.user_id, feature_key: request.feature_key },
    });
  }

  async create(payload: CreateChatConfigDto): Promise<CreateChatConfigDto> {
    const chatConfig = this.chatConfigRepository.create(payload);
    const saved = await this.chatConfigRepository.save(chatConfig);

    const cacheKey = `${payload.user_id}:chat_config`;
    await this.redis.del(cacheKey);

    return saved;
  }

  async update(
    payload: CreateChatConfigDto,
  ): Promise<CreateChatConfigDto | null> {
    await this.chatConfigRepository.update(
      { user_id: payload.user_id },
      payload,
    );

    const cacheKey = `${payload.user_id}:chat_config`;
    await this.redis.del(cacheKey);

    return this.existing(payload);
  }

  async findBy(request: string): Promise<CreateChatConfigDto[]> {
    const userId = Number(request);
    const cacheKey = `${userId}:chat_config`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.chatConfigRepository.findBy({
      user_id: userId,
    });

    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 60 * 60 * 24 * 7);
    return data;
  }
}
