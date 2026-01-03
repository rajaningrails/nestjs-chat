import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { SocketService } from './socket.service';
import { RedisService } from '../redis.service';

@Injectable()
export class TypingService {
  private readonly TYPING_PREFIX = 'typing:';
  private readonly TYPING_TIMEOUT = 3000; // 3 seconds

  constructor(
    private readonly redisService: RedisService,
    private readonly socketService: SocketService,
  ) {}

  private get redis() {
    return this.redisService.getClient();
  }
  
  /**
   * Start typing in a conversation
   */
  async startTyping(conversationId: number, userId: number): Promise<void> {
    const key = `${this.TYPING_PREFIX}${conversationId}`;
    
    // Add user to typing set
    await this.redis.sadd(key, userId.toString());
    await this.redis.expire(key, 10); // Auto-expire after 10 seconds

    // Emit to conversation room
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
    
    // Remove user from typing set
    await this.redis.srem(key, userId.toString());

    // Emit to conversation room
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