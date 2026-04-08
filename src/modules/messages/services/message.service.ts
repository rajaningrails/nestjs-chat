import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageProcessorConfig } from 'src/infrastructure/bullmq/size-queue.config';
import { MessageDto } from '../dto/message.dto';
import { Message } from '../entities/message.entity';
import { SeenMessageDto } from '../dto/seen-message.dto';

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

  async oneToOneChatMessageSeen(request: SeenMessageDto) {
    if (!request?.id) {
      throw new Error('Message ID is required for seen status');
    }

    await this.messageQueue.add('one-to-one-seen', request, {
      jobId: `one-to-one-message-seen-${request?.id}`,
      priority: 3,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  }

  async groupChatMessageSeen(request) {
    if (!request.id) {
      throw new Error('Message ID is required for group seen status');
    }
    await this.messageQueue.add(
      'group-message-seen',
      { ...request },
      {
        jobId: `group-message-seen-${request.id}-${request.seen_update_sender_id}-${Date.now()}`,
        priority: 3,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );
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
