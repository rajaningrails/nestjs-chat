import { Injectable } from '@nestjs/common';
import { SocketService } from './socket.service';
import { RedisService } from '../redis.service';
import { Redis } from 'ioredis';

@Injectable()
export class TypingService {
  private readonly TYPING_PREFIX = 'typing:';
  private readonly TYPING_TIMEOUT = 8000;

  constructor(
    private readonly redisService: RedisService,
    private readonly socketService: SocketService,
  ) {}

  private get redis():Redis {
    return this.redisService.getClient();
  }
  
  /**
   * Start typing in a conversation
   */
  async startTyping(conversationId: number, userId: number): Promise<void> {
    const key = `${this.TYPING_PREFIX}${conversationId}`;
  
    await this.redis.multi()
      .sadd(key, userId.toString())
      .expire(key, this.TYPING_TIMEOUT)
      .exec();
  
    const roomId = `conversation:${conversationId}`;
    await this.socketService.emitToRoom(roomId, 'user-typing', {
      conversation_id: conversationId,
      user_id: userId,
      isTyping: true,
    });
  }  

  /**
   * Stop typing in a conversation
   */
  async stopTyping(conversationId: number, userId: number): Promise<void> {
    const key = `${this.TYPING_PREFIX}${conversationId}`;
    
    await this.redis.srem(key, userId.toString());

    const roomId = `conversation:${conversationId}`;
    await this.socketService.emitToRoom(roomId, 'user-typing', {
      conversation_id: conversationId,
      user_id: userId,
      isTyping: false,
    });
  }

  /**
   * Get who's typing in a conversation
   */
  async getTypingUsers(conversationId: number): Promise<number[]> {
    const key = `${this.TYPING_PREFIX}${conversationId}`;
    const users = await this.redis.smembers(key);
    return users.map((u) => parseInt(u));
  }

  /**
   * Clear all typing indicators for a conversation
   */
  async clearTyping(conversationId: number): Promise<void> {
    const key = `${this.TYPING_PREFIX}${conversationId}`;
    await this.redis.del(key);
  }
}