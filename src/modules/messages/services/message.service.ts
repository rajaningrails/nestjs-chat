import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { MessageDto } from '../dto/message.dto';
import { Message } from '../entities/message.entity';

@Injectable()
export class MessageService {
  constructor(
    @InjectQueue(MessageProcessorConfig.queue_name) private messageQueue: Queue,
  ) {}

  async createMessage(payload: MessageDto): Promise<Partial<Message>> {
    const data = {
      ...payload,
      updated_at: new Date(),
      created_at: new Date(),
    };

    await this.messageQueue.add('save-message', data, {
      priority: 2,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return { ...data } as Partial<Message>;
  }

  async createMessages(payload: MessageDto[]): Promise<Partial<Message>[]> {
    const payloads = payload.map((create) => ({
      ...create,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const jobs = payloads.map((data) => ({
      name: 'save-message',
      data,
      opts: {
        priority: 2,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }));

    await this.messageQueue.addBulk(jobs);

    return payloads as Partial<Message>[];
  }

  async updateMessage(payload: Partial<MessageDto>): Promise<Partial<Message>> {
    if (!payload.id) {
      throw new Error('Message ID is required for update');
    }

    const data = {
      ...payload,
      updated_at: new Date(),
    };

    await this.messageQueue.add('update-message', data, {
      priority: 2,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    return { ...data };
  }

  async updateMessages(
    updates: Array<Partial<MessageDto>>,
  ): Promise<Partial<Message>[]> {
    const invalidUpdates = updates.filter((update) => !update.id);
    if (invalidUpdates.length > 0) {
      throw new Error(
        `${invalidUpdates.length} updates missing required ID field`,
      );
    }

    const payloads = updates.map((update) => ({
      ...update,
      updated_at: new Date(),
    }));

    const jobs = payloads.map((data) => ({
      name: 'update-message',
      data,
      opts: {
        priority: 2,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }));

    await this.messageQueue.addBulk(jobs);

    return payloads;
  }

  async deleteMessage(messageId: string | number) {
    if (!messageId) {
      throw new Error('Message ID is required for delete');
    }

    await this.messageQueue.add(
      'delete-message',
      { id: messageId },
      {
        priority: 2,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    );
  }

  async deleteMessages(messageIds: Array<string | number>) {
    if (!messageIds || messageIds.length === 0) {
      throw new Error('At least one message ID is required for batch delete');
    }

    const jobs = messageIds.map((id) => ({
      name: 'delete-message',
      data: { id },
      opts: {
        priority: 2,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }));

    await this.messageQueue.addBulk(jobs);
  }

  async oneToOneChatMessageSeen(messageId: string | number) {
    if (!messageId) {
      throw new Error('Message ID is required for seen status');
    }

    await this.messageQueue.add(
      'one-to-one-seen',
      { id: messageId },
      {
        jobId: `one-to-one-message-seen-${messageId}`,
        priority: 3,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );
  }

  async oneToOneChatMessageSeenBatch(messageIds: Array<string | number>) {
    if (!messageIds || messageIds.length === 0) {
      throw new Error('At least one message ID is required for batch seen');
    }

    const jobs = messageIds.map((id) => ({
      name: 'one-to-one-seen',
      data: { id },
      opts: {
        jobId: `one-to-one-message-seen-${id}`,
        priority: 3,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }));

    await this.messageQueue.addBulk(jobs);
  }

  async groupChatMessageSeen(messageId: string | number) {
    if (!messageId) {
      throw new Error('Message ID is required for group seen status');
    }

    await this.messageQueue.add(
      'group-seen',
      { id: messageId },
      {
        jobId: `group-message-seen-${messageId}`,
        priority: 3, 
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );
  }

  async groupChatMessageSeenBatch(messageIds: Array<string | number>) {
    if (!messageIds || messageIds.length === 0) {
      throw new Error(
        'At least one message ID is required for batch group seen',
      );
    }

    const jobs = messageIds.map((id) => ({
      name: 'group-seen',
      data: { id },
      opts: {
        jobId: `group-message-seen-${id}`,
        priority: 3,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }));

    await this.messageQueue.addBulk(jobs);
  }

  async flushBuffers() {
    await this.messageQueue.add(
      'flush-buffers',
      {},
      {
        priority: 1,
        attempts: 1,
      },
    );
  }
}
