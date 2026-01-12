import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { SocketService } from './socket.service';
import { RedisService } from '../redis.service';

interface PresenceStatus {
  userId: number;
  status: 'online' | 'offline';
  lastSeen: Date;
}

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly PRESENCE_PREFIX = 'presence:';
  private readonly PRESENCE_AUDIENCE_PREFIX = 'presence:audience:';
  private readonly ONLINE_TTL = 3600; // 1 hour
  private readonly OFFLINE_TTL = 86400; // 24 hours

  constructor(
    private readonly redisService: RedisService,
    private readonly socketService: SocketService,
  ) {
  }

  private get redis(): Redis {
    return this.redisService.getClient();
  }

  async setOnline(userId: number): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${userId}`;
    const presence: PresenceStatus = {
      userId,
      status: 'online',
      lastSeen: new Date(),
    };

    await this.redis.set(
      key,
      JSON.stringify(presence),
      'EX',
      this.ONLINE_TTL
    );

    await this.broadcastPresenceChange(userId, 'online');
  }



  async setOffline(userId: number): Promise<void> {
    const key = `${this.PRESENCE_PREFIX}${userId}`;
    const presence: PresenceStatus = {
      userId,
      status: 'offline',
      lastSeen: new Date(),
    };

    await this.redis.set(
      key,
      JSON.stringify(presence),
      'EX',
      this.OFFLINE_TTL
    );

    await this.broadcastPresenceChange(userId, 'offline');
  }

  async getPresence(userId: number): Promise<PresenceStatus | null> {
    const key = `${this.PRESENCE_PREFIX}${userId}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    const presence = JSON.parse(data) as PresenceStatus;
    presence.lastSeen = new Date(presence.lastSeen);

    return presence;
  }

  async getBulkPresence(userIds: number[]): Promise<Map<number, PresenceStatus>> {
    const presenceMap = new Map<number, PresenceStatus>();

    if (userIds.length === 0) return presenceMap;

    try {
      const pipeline = this.redis.pipeline();

      for (const userId of userIds) {
        const key = `${this.PRESENCE_PREFIX}${userId}`;
        pipeline.get(key);
      }

      const results = await pipeline.exec();

      if (!results) return presenceMap;

      for (let i = 0; i < results.length; i++) {
        const [err, data] = results[i];
        if (!err && data) {
          const presence = JSON.parse(data as string) as PresenceStatus;
          presence.lastSeen = new Date(presence.lastSeen);
          presenceMap.set(userIds[i], presence);
        }
      }
    } catch (error) {
      this.logger.error('Failed to get bulk presence:', error);
    }

    return presenceMap;
  }


  private async broadcastPresenceChange(
    userId: number,
    status: 'online' | 'offline',
  ): Promise<void> {
    try {
      const audienceKey = `${this.PRESENCE_AUDIENCE_PREFIX}${userId}`;
      const targetUserIds = await this.redis.smembers(audienceKey);

      if (targetUserIds.length === 0) return;

      const payload = {
        user_id: userId,
        status,
        timestamp: new Date(),
      };

      const numericUserIds = targetUserIds.map(id => parseInt(id, 10));
      await this.socketService.emitToUsers(
        numericUserIds,
        'user-presence-changed',
        payload,
        50
      );
    } catch (error) {
      this.logger.error(`Failed to broadcast presence for user ${userId}:`, error);
    }
  }

  async getOnlineStatuses(userIds: number[]): Promise<Map<number, boolean>> {
    const statusMap = new Map<number, boolean>();

    const presences = await this.getBulkPresence(userIds);

    for (const userId of userIds) {
      const presence = presences.get(userId);
      statusMap.set(
        userId,
        presence?.status === 'online'
      );
    }

    return statusMap;
  }

  /**
   * Cleanup expired presence data (run via cron)
   */
  async cleanupExpiredPresence(): Promise<number> {
    let cleaned = 0;

    try {
      const pattern = `${this.PRESENCE_PREFIX}*`;
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
          const ttl = await this.redis.ttl(key);
          if (ttl === -1) {
            await this.redis.expire(key, this.OFFLINE_TTL);
          } else if (ttl === -2) {
            continue;
          }
        }
      } while (cursor !== '0');

    } catch (error) {
    }

    return cleaned;
  }
}