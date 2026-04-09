import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../redis.service';
import Redis from 'ioredis';
import { GroupRepository } from 'src/modules/group/repositories/group.repository';

interface EmitOptions {
  timeout?: number;
  requireAck?: boolean;
  retry?: number;
}

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);
  private server: Server | null = null;

  private readonly USER_SOCKET_PREFIX = 'socket:user:';
  private readonly SOCKET_USER_PREFIX = 'socket:id:';
  private readonly GROUP_MEMBERS_PREFIX = 'group:members:';
  private readonly SOCKET_TTL = 86400; // 24 hours
  private readonly GROUP_MEMBERS_TTL = 3600; // 1 hour

  constructor(
    private readonly redisService: RedisService,
    private readonly groupRepository: GroupRepository,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  private get redis(): Redis {
    return this.redisService.getClient();
  }

  /**
   * Store user's socket with atomic operations
   */
  async addUserSocket(userId: number, socketId: string): Promise<boolean> {
    const pipeline = this.redis.pipeline();

    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      const socketKey = `${this.SOCKET_USER_PREFIX}${socketId}`;

      pipeline.sadd(userKey, socketId);
      pipeline.expire(userKey, this.SOCKET_TTL);
      pipeline.set(socketKey, userId.toString(), 'EX', this.SOCKET_TTL);

      await pipeline.exec();

      return true;
    } catch (error) {
      this.logger.error(`Failed to add socket for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Remove socket with cleanup
   */
  async removeUserSocket(userId: number, socketId: string): Promise<void> {
    const pipeline = this.redis.pipeline();

    const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
    const socketKey = `${this.SOCKET_USER_PREFIX}${socketId}`;

    pipeline.srem(userKey, socketId);
    pipeline.del(socketKey);
    pipeline.scard(userKey);

    const results = await pipeline.exec();

    const remainingSockets = results?.[2]?.[1] as number;
    if (remainingSockets === 0) {
      await this.redis.del(userKey);
    }
  }

  /**
   * Get all socket IDs for a user
   */
  async getUserSockets(userId: number): Promise<string[]> {
    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      const sockets = await this.redis.smembers(userKey);

      const activeSockets: string[] = [];
      const deadSockets: string[] = [];

      for (const socketId of sockets) {
        if (this.server?.sockets.sockets.has(socketId)) {
          activeSockets.push(socketId);
        } else {
          deadSockets.push(socketId);
        }
      }

      if (deadSockets.length > 0) {
        const pipeline = this.redis.pipeline();
        deadSockets.forEach((id) => {
          pipeline.srem(userKey, id);
          pipeline.del(`${this.SOCKET_USER_PREFIX}${id}`);
        });
        await pipeline.exec();
      }

      return activeSockets;
    } catch (error) {
      this.logger.error(`Failed to get sockets for user ${userId}:`, error);
      return [];
    }
  }

  async clearAllSocketMappings(): Promise<void> {
    try {
      const patterns = [
        `${this.USER_SOCKET_PREFIX}*`,
        `${this.SOCKET_USER_PREFIX}*`,
      ];

      for (const pattern of patterns) {
        let cursor = '0';
        do {
          const [newCursor, keys] = await this.redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100,
          );
          cursor = newCursor;
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } while (cursor !== '0');
      }

      this.logger.log('Cleared all stale socket mappings on startup');
    } catch (error) {
      this.logger.error('Failed to clear socket mappings:', error);
    }
  }

  /**
   * Get user ID from socket
   */
  async getUserIdBySocket(socketId: string): Promise<number | null> {
    try {
      const socketKey = `${this.SOCKET_USER_PREFIX}${socketId}`;
      const userId = await this.redis.get(socketKey);
      return userId ? parseInt(userId, 10) : null;
    } catch (error) {
      this.logger.error(`Failed to get user for socket ${socketId}:`, error);
      return null;
    }
  }

  /**
   * Get group member IDs with caching
   */
  async getGroupMemberIds(groupId: number): Promise<number[]> {
    try {
      const cacheKey = `${this.GROUP_MEMBERS_PREFIX}${groupId}`;

      // Try to get from cache first
      const cached = await this.redis.smembers(cacheKey);
      if (cached.length > 0) {
        return cached.map((id) => parseInt(id, 10));
      }

      // Fetch from database
      const members = await this.groupRepository.getGroupMembers(groupId);

      const memberIds = members.map((m) => m.user_id);

      // Cache the result
      if (memberIds.length > 0) {
        const pipeline = this.redis.pipeline();
        memberIds.forEach((id) => pipeline.sadd(cacheKey, id.toString()));
        pipeline.expire(cacheKey, this.GROUP_MEMBERS_TTL);
        await pipeline.exec();
      }

      return memberIds;
    } catch (error) {
      this.logger.error(
        `Failed to get group members for group ${groupId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Invalidate group members cache
   */
  async invalidateGroupMembersCache(groupId: number): Promise<void> {
    try {
      const cacheKey = `${this.GROUP_MEMBERS_PREFIX}${groupId}`;
      await this.redis.del(cacheKey);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache for group ${groupId}:`,
        error,
      );
    }
  }

  /**
   * Emit to a single user across all their devices
   */
  async emitToUser(
    userId: number,
    event: string,
    data: any,
    options?: EmitOptions,
  ): Promise<boolean> {
    try {
      const sockets = await this.getUserSockets(userId);

      if (sockets.length === 0) {
        this.logger.debug(`No active sockets for user ${userId}`);
        return false;
      }

      await Promise.all(
        sockets.map((socketId) => {
          const socket = this.server?.sockets.sockets.get(socketId);
          if (!socket) return Promise.resolve();

          return new Promise<void>((resolve, reject) => {
            if (options?.requireAck) {
              const timeout = setTimeout(() => {
                reject(new Error('Acknowledgment timeout'));
              }, options.timeout || 5000);

              socket.emit(event, data, () => {
                clearTimeout(timeout);
                resolve();
              });
            } else {
              socket.emit(event, data);
              resolve();
            }
          });
        }),
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to emit to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Emit to multiple users in parallel with batching
   */
  async emitToUsers(
    userIds: number[],
    event: string,
    data: any,
    batchSize: number = 50,
    excludeUserId?: number,
  ): Promise<void> {
    try {
      const uniqueUserIds = [...new Set(userIds)];
      const filteredUserIds = uniqueUserIds.filter(
        (userId) => userId !== excludeUserId,
      );
      for (let i = 0; i < filteredUserIds.length; i += batchSize) {
        const batch = filteredUserIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map((userId) => this.emitToUser(userId, event, data)),
        );
      }
    } catch (error) {
      this.logger.error('Failed to emit to multiple users:', error);
    }
  }

  async broadcast(
    event: string,
    data: any,
    batchSize: number = 80,
  ): Promise<void> {
    try {
      const connectedUserIds = await this.getOnlineUsers();

      if (connectedUserIds.length === 0) {
        this.logger.warn('No users connected for broadcast');
        return;
      }

      this.logger.log(`Broadcasting to ${connectedUserIds.length} users`);

      for (let i = 0; i < connectedUserIds.length; i += batchSize) {
        const batch = connectedUserIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map((userId) => this.emitToUser(userId, event, data)),
        );
      }
      this.logger.log(`Broadcast completed for event: ${event}`);
    } catch (error) {
      this.logger.error('Failed to broadcast to all users:', error);
      throw error;
    }
  }

  /**
   * Emit to all members of a group
   * @param groupId - The group ID
   * @param event - Event name
   * @param data - Data to emit
   * @param excludeUserId - Optional user ID to exclude from emission
   * @param excludeUserIds - Optional array of user IDs to exclude from emission
   */
  async emitToGroupMembers(
    groupId: number,
    event: string,
    data: any,
    excludeUserId?: number,
    excludeUserIds?: number[],
  ): Promise<void> {
    try {
      const memberIds = await this.getGroupMemberIds(groupId);

      if (memberIds.length === 0) {
        this.logger.debug(`No members found for group ${groupId}`);
        return;
      }

      // Filter out excluded users
      let targetUserIds = memberIds;

      if (excludeUserId) {
        targetUserIds = targetUserIds.filter((id) => id !== excludeUserId);
      }

      if (excludeUserIds && excludeUserIds.length > 0) {
        const excludeSet = new Set(excludeUserIds);
        targetUserIds = targetUserIds.filter((id) => !excludeSet.has(id));
      }

      if (targetUserIds.length === 0) {
        this.logger.debug(
          `No target users after exclusions for group ${groupId}`,
        );
        return;
      }

      await this.emitToUsers(targetUserIds, event, data);
    } catch (error) {
      this.logger.error(`Failed to emit to group ${groupId}:`, error);
    }
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: number): Promise<boolean> {
    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      const count = await this.redis.scard(userKey);
      return count > 0;
    } catch (error) {
      this.logger.error(
        `Failed to check online status for user ${userId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get all online users
   */
  async getOnlineUsers(): Promise<number[]> {
    try {
      const onlineUsers = new Set<number>();
      const pattern = `${this.USER_SOCKET_PREFIX}*`;

      let cursor = '0';
      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );

        cursor = newCursor;

        for (const key of keys) {
          const userId = parseInt(key.replace(this.USER_SOCKET_PREFIX, ''), 10);
          if (!isNaN(userId)) {
            onlineUsers.add(userId);
          }
        }
      } while (cursor !== '0');

      return Array.from(onlineUsers);
    } catch (error) {
      this.logger.error('Failed to get online users:', error);
      return [];
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.server?.sockets.sockets.size || 0;
  }

  /**
   * Disconnect user from all devices
   */
  async disconnectUser(userId: number, reason?: string): Promise<void> {
    try {
      const sockets = await this.getUserSockets(userId);

      await Promise.all(
        sockets.map(async (socketId) => {
          const socket = this.server?.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
          await this.removeUserSocket(userId, socketId);
        }),
      );

      this.logger.log(`User ${userId} disconnected: ${reason || 'No reason'}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect user ${userId}:`, error);
    }
  }

  /**
   * Cleanup stale connections (run periodically via cron)
   */
  async cleanupStaleConnections(): Promise<number> {
    let cleaned = 0;
    try {
      const pattern = `${this.SOCKET_USER_PREFIX}*`;
      let cursor = '0';

      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );

        cursor = newCursor;

        for (const key of keys) {
          const socketId = key.replace(this.SOCKET_USER_PREFIX, '');

          if (!this.server?.sockets.sockets.has(socketId)) {
            const userId = await this.getUserIdBySocket(socketId);
            if (userId) {
              await this.removeUserSocket(userId, socketId);
              cleaned++;
            }
          }
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.error('Failed to cleanup stale connections:', error);
    }

    return cleaned;
  }
}
