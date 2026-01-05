import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SocketService } from 'src/common/services/socket/socket.service';
import { PresenceService } from 'src/common/services/socket/presence.service';
import { MessageRepository } from 'src/modules/messages/repositories/message.repository';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';

@Injectable()
export class SocketCleanupJob {
  constructor(
    private readonly socketService: SocketService,
    private readonly presenceService: PresenceService,
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository
  ) { }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async cleanupStaleConnections() {
    await this.socketService.cleanupStaleConnections();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredPresence() {
    await this.presenceService.cleanupExpiredPresence();
  }

  // @Cron('0 3 * * *')
  // async cleanupOldMessages() {
  //   await this.messageRepository.cleanupOldMessages(90);
  // }

  // @Cron('0 3 * * *')
  // async cleanupOldConversations() {
  //   await this.conversationRepository.cleanupOldDeletedConversations(90);
  // }
}