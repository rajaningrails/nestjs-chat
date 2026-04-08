import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SocketService } from './socket.service';
import { RedisService } from '../redis.service';
import Redis from 'ioredis';

@Injectable()
export class TypingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TypingService.name);
  private readonly TYPING_PREFIX = 'typing:';
  private readonly TYPING_MEMBERS_PREFIX = 'conv:members:typing:';
  private readonly TYPING_TIMEOUT_SECONDS = 10;
  private subscriber!: Redis;

  constructor(
    private readonly redisService: RedisService,
    private readonly socketService: SocketService,
  ) {}

  private get redis(): Redis {
    return this.redisService.getClient();
  }

  async onApplicationBootstrap() {
    try {
      this.logger.log('TypingService: waiting for Redis...');
      await this.redisService.waitUntilReady();

      this.subscriber = this.redisService.getClient().duplicate();
      await this.subscriber.connect(); // <-- add this line

      await this.subscriber.subscribe('__keyevent@0__:expired');

      this.subscriber.on('message', async (channel, expiredKey) => {
        if (!expiredKey.startsWith(this.TYPING_PREFIX)) return;
        const conversationId = Number(
          expiredKey.replace(this.TYPING_PREFIX, ''),
        );
        if (isNaN(conversationId)) return;
        await this.handleTypingExpiry(conversationId);
      });

      this.logger.log('TypingService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize TypingService:', error);
    }
  }

  async onModuleDestroy() {
    await this.subscriber?.unsubscribe();
    await this.subscriber?.quit();
  }

  private async handleTypingExpiry(conversationId: number): Promise<void> {
    const typingData = {
      typing_state_conversation_id: conversationId,
      is_typing: false,
      expired: true,
      timestamp: new Date(),
    };

    try {
      const membersKey = `${this.TYPING_MEMBERS_PREFIX}${conversationId}`;
      const memberStrings = await this.redis.smembers(membersKey);
      const memberIds = memberStrings
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      if (memberIds.length === 0) {
        this.logger.debug(
          `No members found for expired typing conversation ${conversationId}`,
        );
        return;
      }

      await this.socketService.emitToUsers(memberIds, 'hideTyping', typingData);

      await this.redis.del(membersKey);
    } catch (error) {
      this.logger.error(
        `Failed to emit hideTyping on expiry for conversation ${conversationId}:`,
        error,
      );
    }
  }

  async startTyping(
    data: {
      typing_state_conversation_id: number;
      typing_state_sender_id: number;
      typing_state_receiver_id: number;
      group_id?: number;
    },
    userId: number,
  ): Promise<void> {
    try {
      const key = `${this.TYPING_PREFIX}${data.typing_state_conversation_id}`;
      const membersKey = `${this.TYPING_MEMBERS_PREFIX}${data.typing_state_conversation_id}`;
      const isGroupChat = !Number(data.typing_state_receiver_id);

      await this.redis
        .multi()
        .sadd(key, userId.toString())
        .expire(key, this.TYPING_TIMEOUT_SECONDS)
        .exec();

      let memberIds: number[] = [];

      if (isGroupChat && data.group_id) {
        memberIds = await this.socketService.getGroupMemberIds(data.group_id);
      } else {
        memberIds = [
          data.typing_state_sender_id,
          data.typing_state_receiver_id,
        ].filter((id): id is number => !!id);
      }

      if (memberIds.length > 0) {
        await this.redis
          .multi()
          .sadd(membersKey, ...memberIds.map(String))
          .expire(membersKey, this.TYPING_TIMEOUT_SECONDS + 5)
          .exec();
      }

      const typingData = {
        typing_state_conversation_id: data.typing_state_conversation_id,
        typing_state_receiver_id: data.typing_state_receiver_id,
        user_id: userId,
        is_typing: true,
        timestamp: new Date(),
      };

      if (isGroupChat) {
        await this.socketService.emitToUsers(
          memberIds,
          'typing',
          typingData,
          userId,
        );
      } else {
        await this.socketService.emitToUser(
          data.typing_state_receiver_id,
          'typing',
          typingData,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to start typing for user ${userId}:`, error);
    }
  }

  async stopTyping(
    data: {
      typing_state_conversation_id: number;
      typing_state_sender_id: number;
      typing_state_receiver_id: number;
      group_id?: number;
    },
    userId: number,
  ): Promise<void> {
    try {
      const key = `${this.TYPING_PREFIX}${data.typing_state_conversation_id}`;
      const membersKey = `${this.TYPING_MEMBERS_PREFIX}${data.typing_state_conversation_id}`;
      const isGroupChat = !Number(data.typing_state_receiver_id);

      await this.redis.srem(key, userId.toString());

      const typingData = {
        typing_state_conversation_id: data.typing_state_conversation_id,
        typing_state_receiver_id: data.typing_state_receiver_id,
        user_id: userId,
        is_typing: false,
        timestamp: new Date(),
      };

      if (isGroupChat && data.group_id) {
        const memberIds = await this.socketService.getGroupMemberIds(
          data.group_id,
        );
        await this.socketService.emitToUsers(
          memberIds,
          'hideTyping',
          typingData,
          userId,
        );
      } else {
        await this.socketService.emitToUser(
          data.typing_state_receiver_id,
          'hideTyping',
          typingData,
        );
      }

      // Cleanup members key when explicitly stopped
      await this.redis.del(membersKey);
    } catch (error) {
      this.logger.error(`Failed to stop typing for user ${userId}:`, error);
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
