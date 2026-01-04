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

    // Add to batch
    this.messageBatch.push(messageData);
    
    // Store conversation update if present
    if (conversationUpdate) {
      this.conversationUpdates.push(conversationUpdate);
    }

    // Flush if batch is full or has conversation updates
    if (this.messageBatch.length >= this.BATCH_SIZE || conversationUpdate) {
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
    
    // Clear immediately to accept new messages
    this.messageBatch = [];
    this.conversationUpdates = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      // Save all messages in one batch
      await this.messageRepository.saveBatch(batch);
      this.logger.log(`✅ Saved ${batch.length} messages`);

      // Queue conversation updates after successful save
      if (updates.length > 0) {
        const jobs = updates.map(update => ({
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
        this.logger.log(`✅ Queued ${updates.length} conversation updates`);
      }

    } catch (error) {
      this.logger.error(`❌ Batch failed, falling back to individual saves`, error);
      
      // Fallback: save individually
      for (let i = 0; i < batch.length; i++) {
        const msg = batch[i];
        try {
          await this.messageRepository.save(msg);
          
          // Queue corresponding conversation update
          if (updates[i]) {
            await this.messageQueue.add('update-conversation', updates[i], {
              priority: 2,
              attempts: 3,
            });
          }
        } catch (err) {
          this.logger.error(`Failed to save message ${msg.id}:`, err);
        }
      }
    }
  }

  private async markSeen(data: { message_id: string; seenAt: Date }) {
    await this.messageRepository.markAsSeen(data.message_id, data.seenAt);
    this.logger.log(`✅ Message ${data.message_id} marked as seen`);
    return { success: true };
  }

  private async deleteMessage(data: { message_id: string }) {
    const deleted = await this.messageRepository.softDelete(data.message_id);
    this.logger.log(`✅ Message ${data.message_id} deleted`);
    return { success: deleted };
  }

  private async updateConversation(data: ConversationUpdateData) {
    try {
      await this.conversationRepository.updateLastMessageSafe(data);
      this.logger.log(`✅ Updated conversation ${data.conversationId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Failed to update conversation ${data.conversationId}:`, error);
      throw error;
    }
  }

  // Cleanup on shutdown
  async onModuleDestroy() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    // Flush any remaining messages
    if (this.messageBatch.length > 0) {
      await this.flushBatch();
    }
  }
}