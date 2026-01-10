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
    await this.messageQueue.add('save-message', data);
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
    }));

    await this.messageQueue.addBulk(jobs);
    return payload;
  }

  async updateMessage(payload: MessageDto): Promise<Partial<Message>> {
    const data = {
      ...payload,
      updated_at: new Date(),
    };

    await this.messageQueue.add('update-message', data);

    return { ...data };
  }

  async deleteMessage(messageId: string) {
    await this.messageQueue.add('delete-message', messageId);
  }

  async updateMessages(
    updates: Array<Partial<MessageDto>>,
  ): Promise<Partial<Message>[]> {
    const payloads = updates?.map((update) => ({
      ...update,
      updated_at: new Date(),
    }));

    const jobs = updates.map((update) => ({
      name: 'update-message',
      data: update,
    }));

    await this.messageQueue.addBulk(jobs);

    return payloads;
  }
  async oneToOneChatMessageSeen(messageId: string) {
    await this.messageQueue.add('one-to-one-seen', messageId, {
      jobId: `one-to-one-message-seen-${messageId}`,
      priority: 3,
    });
  }
  async groupChatMessageSeen(messageId: string) {
    await this.messageQueue.add('group-seen', messageId, {
      jobId: `group-message-seen-${messageId}`,
      priority: 3,
    });
  }
}
