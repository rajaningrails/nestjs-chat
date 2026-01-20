import { Injectable, Logger } from '@nestjs/common';
import { SocketService } from './socket.service';
import { RedisService } from '../redis.service';
import { Redis } from 'ioredis';

@Injectable()
export class TypingService {
  private readonly logger = new Logger(TypingService.name);
  private readonly TYPING_PREFIX = 'typing:';
  private readonly TYPING_TIMEOUT_MS = 8000; // 8 seconds
  private readonly TYPING_TIMEOUT_SECONDS = 10; // Redis TTL

  constructor(
    private readonly redisService: RedisService,
    private readonly socketService: SocketService,
  ) {}

  private get redis(): Redis {
    return this.redisService.getClient();
  }

  /**
   * Start typing in a conversation
   * For one-to-one: pass receiverId
   * For group: pass groupId
   */
  async startTyping(
    conversationId: number,
    userId: number,
    receiverId?: number,
    groupId?: number,
  ): Promise<void> {
    try {
      const key = `${this.TYPING_PREFIX}${conversationId}`;

      await this.redis
        .multi()
        .sadd(key, userId.toString())
        .expire(key, this.TYPING_TIMEOUT_SECONDS)
        .exec();

      const typingData = {
        conversation_id: conversationId,
        user_id: userId,
        is_typing: true,
        timestamp: new Date(),
      };

      if (groupId) {
        // Group chat - emit to all members except the typer
        await this.socketService.emitToGroupMembers(
          groupId,
          'user-typing',
          typingData,
          userId, // exclude the user who is typing
        );
      } else if (receiverId) {
        // One-to-one chat - emit only to the receiver
        await this.socketService.emitToUser(receiverId, 'user-typing', typingData);
      }
    } catch (error) {
      this.logger.error(
        `Failed to start typing for user ${userId} in conversation ${conversationId}:`,
        error,
      );
    }
  }

  /**
   * Stop typing in a conversation
   * For one-to-one: pass receiverId
   * For group: pass groupId
   */
  async stopTyping(
    conversationId: number,
    userId: number,
    receiverId?: number,
    groupId?: number,
  ): Promise<void> {
    try {
      const key = `${this.TYPING_PREFIX}${conversationId}`;

      await this.redis.srem(key, userId.toString());

      const typingData = {
        conversation_id: conversationId,
        user_id: userId,
        is_typing: false,
        timestamp: new Date(),
      };

      if (groupId) {
        // Group chat - emit to all members except the typer
        await this.socketService.emitToGroupMembers(
          groupId,
          'user-typing',
          typingData,
          userId, // exclude the user who stopped typing
        );
      } else if (receiverId) {
        // One-to-one chat - emit only to the receiver
        await this.socketService.emitToUser(receiverId, 'user-typing', typingData);
      }
    } catch (error) {
      this.logger.error(
        `Failed to stop typing for user ${userId} in conversation ${conversationId}:`,
        error,
      );
    }
  }

  /**
   * Get who's typing in a conversation
   */
  async getTypingUsers(conversationId: number): Promise<number[]> {
    try {
      const key = `${this.TYPING_PREFIX}${conversationId}`;
      const users = await this.redis.smembers(key);
      return users.map((u) => parseInt(u, 10)).filter((u) => !isNaN(u));
    } catch (error) {
      this.logger.error(
        `Failed to get typing users for conversation ${conversationId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Clear all typing indicators for a conversation
   */
  async clearTyping(conversationId: number): Promise<void> {
    try {
      const key = `${this.TYPING_PREFIX}${conversationId}`;
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(
        `Failed to clear typing for conversation ${conversationId}:`,
        error,
      );
    }
  }

  /**
   * Clear typing indicator for a specific user in a conversation
   */
  async clearUserTyping(conversationId: number, userId: number): Promise<void> {
    try {
      const key = `${this.TYPING_PREFIX}${conversationId}`;
      await this.redis.srem(key, userId.toString());
    } catch (error) {
      this.logger.error(
        `Failed to clear typing for user ${userId} in conversation ${conversationId}:`,
        error,
      );
    }
  }
}