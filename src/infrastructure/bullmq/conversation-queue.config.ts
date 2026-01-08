import { BullModule } from '@nestjs/bullmq';
import { ConversationProcessorConfig } from './size-queue.config';

export const conversationQueueConfig = BullModule.registerQueue({
  name: ConversationProcessorConfig.queue_name,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1500,
    },
    removeOnComplete: {
      count: 300,
      age: 3600,
    },
    priority: ConversationProcessorConfig.priority,
    removeOnFail: false,
  },
});
