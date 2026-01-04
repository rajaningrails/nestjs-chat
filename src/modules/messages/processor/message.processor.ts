import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { MessageRepository } from '../repositories/message.repository';
import { Message } from '../entities/message.entity';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';

interface ConversationUpdateData {
  conversationId: number;
  messageId: string;
  message: string | null;
  sender_id: number;
  receiver_id: number;
  createdAt: Date;
}

interface MessageWithUpdate extends Partial<Message> {
  _conversationUpdate?: ConversationUpdateData;
}

@Processor('messages', {
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000,
  },
})
@Injectable()
export class MessageProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageProcessor.name);
  private messageBatch: Partial<Message>[] = [];
  private conversationUpdates: ConversationUpdateData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_TIMEOUT = 2000;

  constructor(
    private readonly messageRepository: MessageRepository,
    private readonly conversationRepository: ConversationRepository,
    @InjectQueue('messages') private messageQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const { name, data } = job;

    try {
      switch (name) {
        case 'save-message':
          return await this.saveMessage(data);
        case 'mark-seen':
          return await this.markSeen(data);
        case 'delete-message':
          return await this.deleteMessage(data);
        case 'update-conversation':
          return await this.updateConversation(data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${name} failed:`, error);
      throw error;
    }
  }

  private async saveMessage(data: MessageWithUpdate) {
    const conversationUpdate = data._conversationUpdate;
    const { _conversationUpdate, ...messageData } = data;
    this.messageBatch.push(messageData);
    if (conversationUpdate) {
      this.conversationUpdates.push(conversationUpdate);
    }

    if (this.messageBatch.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_TIMEOUT);
    }

    return { success: true };
  }

  private async flushBatch() {
    if (this.messageBatch.length === 0) return;

    const batch = [...this.messageBatch];
    const updates = [...this.conversationUpdates];
    this.messageBatch = [];
    this.conversationUpdates = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await this.messageRepository.saveBatch(batch);

      if (updates.length > 0) {
        const latestUpdates = new Map<number, ConversationUpdateData>();

        updates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        for (const update of updates) {
          const convId = update.conversationId;
          if (!latestUpdates.has(convId)) {
            latestUpdates.set(convId, update);
          }
        }

        const jobs = Array.from(latestUpdates.values()).map((update) => ({
          name: 'update-conversation',
          data: update,
          opts: {
            priority: 2,
            attempts: 3,
            backoff: {
              type: 'exponential' as const,
              delay: 1000,
            },
          },
        }));

        await this.messageQueue.addBulk(jobs);
      }
    } catch (error) {
      for (let i = 0; i < batch.length; i++) {
        const msg = batch[i];
        try {
          await this.messageRepository.save(msg);
          if (updates[i]) {
            await this.messageQueue.add('update-conversation', updates[i], {
              priority: 2,
              attempts: 3,
            });
          }
        } catch (err) {
          // Handle err
        }
      }
    }
  }

  private async markSeen(data: { message_id: string; seenAt: Date }) {
    await this.messageRepository.markAsSeen(data.message_id, data.seenAt);
    return { success: true };
  }

  private async deleteMessage(data: { message_id: string }) {
    const deleted = await this.messageRepository.softDelete(data.message_id);
    return { success: deleted };
  }

  private async updateConversation(data: ConversationUpdateData) {
    try {
      await this.conversationRepository.updateLastMessageSafe(data);
      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    if (this.messageBatch.length > 0) {
      await this.flushBatch();
    }
  }
}
