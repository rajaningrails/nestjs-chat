import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SocketService } from 'src/common/services/socket/socket.service';
import { PresenceService } from 'src/common/services/socket/presence.service';

@Injectable()
export class SocketCleanupJob {
  constructor(
    private readonly socketService: SocketService,
    private readonly presenceService: PresenceService,
  ) {}
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleConnections() {
    await this.socketService.cleanupStaleConnections();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredPresence() {
    await this.presenceService.cleanupExpiredPresence();
  }
}
