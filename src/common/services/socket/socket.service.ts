import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis.service';

@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);
  private server: Server | null = null;

  // Redis key prefixes
  private readonly USER_SOCKET_PREFIX = 'socket:user:';
  private readonly SOCKET_USER_PREFIX = 'socket:id:';
  private readonly ROOM_MEMBERS_PREFIX = 'room:members:';

  constructor(private readonly redisService: RedisService) {}

  // Set the Socket.IO server instance
  setServer(server: Server) {
    this.server = server;
  }

  private get redis() {
    return this.redisService.getClient();
  }

  // ==================== USER-SOCKET MAPPING ====================

  /**
   * Store user's socket ID in Redis
   * Supports multiple devices (one user can have multiple sockets)
   */
  async addUserSocket(userId: number, socketId: string): Promise<void> {
    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      const socketKey = `${this.SOCKET_USER_PREFIX}${socketId}`;

      // Add socket to user's socket set (supports multiple devices)
      await this.redis.sadd(userKey, socketId);

      // Store reverse mapping (socket -> user)
      await this.redis.set(socketKey, userId.toString(), 'EX', 86400); // 24h expiry

      // Set expiry on user's socket set
      await this.redis.expire(userKey, 86400); // 24 hours

      this.logger.log(`✅ User ${userId} socket ${socketId} stored in Redis`);
    } catch (error) {
      this.logger.error(`Failed to store socket for user ${userId}:`, error);
    }
  }

  /**
   * Remove user's socket from Redis
   */
  async removeUserSocket(userId: number, socketId: string): Promise<void> {
    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      const socketKey = `${this.SOCKET_USER_PREFIX}${socketId}`;

      await this.redis.srem(userKey, socketId);
      await this.redis.del(socketKey);

      this.logger.log(`🗑️ User ${userId} socket ${socketId} removed from Redis`);
    } catch (error) {
      this.logger.error(`Failed to remove socket for user ${userId}:`, error);
    }
  }

  /**
   * Get all socket IDs for a user (supports multiple devices)
   */
  async getUserSockets(userId: number): Promise<string[]> {
    try {
      const userKey = `${this.USER_SOCKET_PREFIX}${userId}`;
      return await this.redis.smembers(userKey);
    } catch (error) {
      this.logger.error(`Failed to get sockets for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get user ID from socket ID
   */
  async getUserIdBySocket(socketId: string): Promise<number | null> {
    try {
      const socketKey = `${this.SOCKET_USER_PREFIX}${socketId}`;
      const userId = await this.redis.get(socketKey);
      return userId ? parseInt(userId) : null;
    } catch (error) {
      this.logger.error(`Failed to get user for socket ${socketId}:`, error);
      return null;
    }
  }

  // ==================== ROOM MANAGEMENT ====================

  /**
   * Add user to a room (conversation, group, etc.)
   */
  async joinRoom(socketId: string, roomId: string, userId: number): Promise<void> {
    try {
      // Add to Socket.IO room
      const socket = this.server?.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(roomId);
      }

      // Track room members in Redis
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      await this.redis.sadd(roomKey, userId.toString());
      await this.redis.expire(roomKey, 86400); // 24h expiry

      this.logger.log(`User ${userId} joined room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to join room ${roomId}:`, error);
    }
  }

  /**
   * Remove user from a room
   */
  async leaveRoom(socketId: string, roomId: string, userId: number): Promise<void> {
    try {
      // Remove from Socket.IO room
      const socket = this.server?.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomId);
      }

      // Remove from Redis room members
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      await this.redis.srem(roomKey, userId.toString());

      this.logger.log(`User ${userId} left room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to leave room ${roomId}:`, error);
    }
  }

  /**
   * Get all members in a room
   */
  async getRoomMembers(roomId: string): Promise<number[]> {
    try {
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      const members = await this.redis.smembers(roomKey);
      return members.map((m) => parseInt(m));
    } catch (error) {
      this.logger.error(`Failed to get room members for ${roomId}:`, error);
      return [];
    }
  }

  /**
   * Remove all users from a room (when room is deleted)
   */
  async clearRoom(roomId: string): Promise<void> {
    try {
      const roomKey = `${this.ROOM_MEMBERS_PREFIX}${roomId}`;
      await this.redis.del(roomKey);
      this.logger.log(`Room ${roomId} cleared`);
    } catch (error) {
      this.logger.error(`Failed to clear room ${roomId}:`, error);
    }
  }

  // ==================== EMIT EVENTS ====================

  /**
   * Emit to a specific user (all their devices)
   */
  async emitToUser(userId: number, event: string, data: any): Promise<void> {
    try {
      const sockets = await this.getUserSockets(userId);
      
      if (sockets.length === 0) {
        this.logger.warn(`No active sockets for user ${userId}`);
        return;
      }

      for (const socketId of sockets) {
        this.server?.to(socketId).emit(event, data);
      }

      this.logger.log(`📤 Event "${event}" sent to user ${userId} (${sockets.length} devices)`);
    } catch (error) {
      this.logger.error(`Failed to emit to user ${userId}:`, error);
    }
  }

  /**
   * Emit to a room (conversation, group)
   */
  async emitToRoom(roomId: string, event: string, data: any): Promise<void> {
    try {
      if (!this.server) {
        throw new Error('Socket.IO server not initialized');
      }

      this.server.to(roomId).emit(event, data);
      this.logger.log(`📤 Event "${event}" sent to room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to emit to room ${roomId}:`, error);
    }
  }

  /**
   * Emit to multiple users
   */
  async emitToUsers(userIds: number[], event: string, data: any): Promise<void> {
    try {
      for (const userId of userIds) {
        await this.emitToUser(userId, event, data);
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
      this.logger.log(`📡 Event "${event}" broadcasted to all clients`);
    } catch (error) {
      this.logger.error('Failed to broadcast:', error);
    }
  }

  // ==================== UTILITY ====================

  /**
   * Check if user is online (has active sockets)
   */
  async isUserOnline(userId: number): Promise<boolean> {
    const sockets = await this.getUserSockets(userId);
    return sockets.length > 0;
  }

  /**
   * Get all online users
   */
  async getOnlineUsers(): Promise<number[]> {
    try {
      const pattern = `${this.USER_SOCKET_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      
      return keys.map((key) => 
        parseInt(key.replace(this.USER_SOCKET_PREFIX, ''))
      );
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
   * Disconnect a user (kick from all devices)
   */
  async disconnectUser(userId: number, reason?: string): Promise<void> {
    try {
      const sockets = await this.getUserSockets(userId);
      
      for (const socketId of sockets) {
        const socket = this.server?.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
        await this.removeUserSocket(userId, socketId);
      }

      this.logger.log(`User ${userId} disconnected: ${reason || 'No reason'}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect user ${userId}:`, error);
    }
  }
}