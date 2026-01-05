import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { RedisService } from '../redis.service';
import Redis from 'ioredis';

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
  private readonly ROOM_MEMBERS_PREFIX = 'room:members:';
  private readonly SOCKET_TTL = 86400; // 24 hours

  constructor(private readonly redisService: RedisService) { }
  setServer(server: Server) {
    this.server = server;
  }

  private get redis(): Redis {
    return this.redisService.getClient();
  }

  /**
   * Store user's socket with atomic operations and proper error handling
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
   * Get all socket IDs for a user with caching
   */
  async getUserSockets(userId: number): Promise<string[]> {
    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      const sockets = await this.redis.smembers(userKey);

      return sockets.filter(socketId =>
        this.server?.sockets.sockets.has(socketId)
      );
    } catch (error) {
      this.logger.error(`Failed to get sockets for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get user ID from socket with error handling
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
   * Join room with proper error handling
   */
  async joinRoom(socketId: string, roomId: string, userId: number): Promise<boolean> {
    try {
      const socket = this.server?.sockets.sockets.get(socketId);
      if (!socket) {
        this.logger.warn(`Socket ${socketId} not found when joining room ${roomId}`);
        return false;
      }

      await socket.join(roomId);

      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      const pipeline = this.redis.pipeline();
      pipeline.sadd(roomKey, userId.toString());
      pipeline.expire(roomKey, this.SOCKET_TTL);
      await pipeline.exec();

      return true;
    } catch (error) {
      this.logger.error(`Failed to join room ${roomId}:`, error);
      return false;
    }
  }

  /**
   * Leave room
   */
  async leaveRoom(socketId: string, roomId: string, userId: number): Promise<void> {
    try {
      const socket = this.server?.sockets.sockets.get(socketId);
      if (socket) {
        await socket.leave(roomId);
      }

      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      await this.redis.srem(roomKey, userId.toString());
    } catch (error) {
      this.logger.error(`Failed to leave room ${roomId}:`, error);
    }
  }

  /**
   * Get room members efficiently
   */
  async getRoomMembers(roomId: string): Promise<number[]> {
    try {
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      const members = await this.redis.smembers(roomKey);
      return members.map(m => parseInt(m, 10));
    } catch (error) {
      this.logger.error(`Failed to get room members for ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Clear room
   */
  async clearRoom(roomId: string): Promise<void> {
    try {
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      await this.redis.del(roomKey);

      // Also remove all sockets from Socket.IO room
      if (this.server) {
        this.server.in(roomId).socketsLeave(roomId);
      }
    } catch (error) {
      this.logger.error(`Failed to clear room ${roomId}:`, error);
    }
  }

  /**
   * Emit to user with parallel execution and options
   */
  async emitToUser(
    userId: number,
    event: string,
    data: any,
    options?: EmitOptions
  ): Promise<boolean> {
    try {
      const sockets = await this.getUserSockets(userId);

      if (sockets.length === 0) {
        this.logger.debug(`No active sockets for user ${userId}`);
        return false;
      }

      await Promise.all(
        sockets.map(socketId => {
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
        })
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to emit to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Emit to room efficiently
   */
  async emitToRoom(
    roomId: string,
    event: string,
    data: any,
    excludeUserId?: number
  ): Promise<boolean> {
    try {
      if (!this.server) return false;

      if (excludeUserId) {
        const excludeSockets = await this.getUserSockets(excludeUserId);
        if (excludeSockets.length > 0) {
          this.server.to(roomId).except(excludeSockets).emit(event, data);
        } else {
          this.server.to(roomId).emit(event, data);
        }
      } else {
        this.server.to(roomId).emit(event, data);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to emit to room ${roomId}:`, error);
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
    batchSize: number = 50
  ): Promise<void> {
    try {
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(userId => this.emitToUser(userId, event, data))
        );
      }
    } catch (error) {
      this.logger.error('Failed to emit to multiple users:', error);
    }
  }

  /**
   * Broadcast to all connected clients
   */
  async broadcast(event: string, data: any): Promise<void> {
    try {
      if (!this.server) {
        throw new Error('Socket.IO server not initialized');
      }

      this.server.emit(event, data);
    } catch (error) {
      this.logger.error('Failed to broadcast:', error);
    }
  }

  async isUserOnline(userId: number): Promise<boolean> {
    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      const count = await this.redis.scard(userKey);
      return count > 0;
    } catch (error) {
      this.logger.error(`Failed to check online status for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get online users 
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
          100
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
        sockets.map(async socketId => {
          const socket = this.server?.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
          await this.removeUserSocket(userId, socketId);
        })
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
          100
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