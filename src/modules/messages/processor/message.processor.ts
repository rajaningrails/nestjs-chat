import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MessageRepository } from '../repositories/message.repository';
import { Message } from '../entities/message.entity';

@Processor('messages', {
  concurrency: 10, // Process 10 jobs simultaneously
  limiter: {
    max: 100, // Max 100 jobs
    duration: 1000, // per second
  },
})
@Injectable()
export class MessageProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageProcessor.name);
  private messageBatch: Partial<Message>[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 50;
  private readonly BATCH_TIMEOUT = 2000; // 2 seconds

  constructor(private readonly messageRepository: MessageRepository) {
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
        
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Job ${name} failed:`, error);
      throw error; // Will trigger retry
    }
  }

  private async saveMessage(data: Partial<Message>) {
    // Add to batch
    this.messageBatch.push(data);

    // Flush if batch is full
    if (this.messageBatch.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    } else if (!this.batchTimer) {
      // Set timer to flush after timeout
      this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_TIMEOUT);
    }

    return { success: true, batched: true };
  }

  private async flushBatch() {
    if (this.messageBatch.length === 0) return;

    const batch = [...this.messageBatch];
    this.messageBatch = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await this.messageRepository.saveBatch(batch);
      this.logger.log(`✅ Batch saved ${batch.length} messages to DB`);
    } catch (error) {
      this.logger.error(`❌ Batch insert failed:`, error);
      for (const msg of batch) {
        try {
          await this.messageRepository.save(msg);
        } catch (err) {
          this.logger.error(`Failed to save message ${msg.id ?? 'unknown'}:`, err);
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
}