import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { SocketService } from './socket.service';
import { RedisService } from '../redis.service';

interface PresenceStatus {
  userId: number;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly PRESENCE_PREFIX = 'presence:';
  private readonly AWAY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly redisService: RedisService,
    private readonly socketService: SocketService,
  ) {}

  private get redis() {
    return this.redisService.getClient();
  }
  
  /**
   * Set user as online
   */
  async setOnline(userId: number): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${userId}`;
    const presence: PresenceStatus = {
      userId,
      status: 'online',
      lastSeen: new Date(),
    };

    await this.redis.set(key, JSON.stringify(presence), 'EX', 3600); // 1 hour
    
    // Broadcast to user's contacts/groups
    await this.broadcastPresenceChange(userId, 'online');
  }

  /**
   * Set user as away (inactive)
   */
  async setAway(userId: number): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${userId}`;
    const presence: PresenceStatus = {
      userId,
      status: 'away',
      lastSeen: new Date(),
    };

    await this.redis.set(key, JSON.stringify(presence), 'EX', 3600);
    await this.broadcastPresenceChange(userId, 'away');
  }

  /**
   * Set user as offline
   */
  async setOffline(userId: number): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${userId}`;
    const presence: PresenceStatus = {
      userId,
      status: 'offline',
      lastSeen: new Date(),
    };

    await this.redis.set(key, JSON.stringify(presence), 'EX', 86400); // 24 hours
    await this.broadcastPresenceChange(userId, 'offline');
  }

  /**
   * Get user's presence status
   */
  async getPresence(userId: number): Promise<PresenceStatus | null> {
    const key = `${this.PRESENCE_PREFIX}${userId}`;
    const data = await this.redis.get(key);
    
    if (!data) return null;

    return JSON.parse(data);
  }

  /**
   * Get multiple users' presence
   */
  async getBulkPresence(userIds: number[]): Promise<Map<number, PresenceStatus>> {
    const presenceMap = new Map<number, PresenceStatus>();

    for (const userId of userIds) {
      const presence = await this.getPresence(userId);
      if (presence) {
        presenceMap.set(userId, presence);
      }
    }

    return presenceMap;
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(userId: number): Promise<void> {
    const presence = await this.getPresence(userId);
    if (presence) {
      presence.lastSeen = new Date();
      const key = `${this.PRESENCE_PREFIX}${userId}`;
      await this.redis.set(key, JSON.stringify(presence), 'EX', 3600);
    }
  }

  /**
   * Broadcast presence change to relevant users
   */
  private async broadcastPresenceChange(
    userId: number,
    status: 'online' | 'away' | 'offline',
  ): Promise<void> {
    // You can customize this to only notify contacts/friends
    // For now, it's a simple example
    
    await this.socketService.broadcast('user-presence-changed', {
      user_id: userId,
      status,
      timestamp: new Date(),
    });
  }
}