import { BullModule } from '@nestjs/bullmq';
import { UserProcessorConfig } from './size-queue.config';

export const userQueueConfig = BullModule.registerQueue({
  name: UserProcessorConfig.queue_name,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 200,
      age: 7200,
    },
    priority: UserProcessorConfig.priority,
    removeOnFail: false
  },
});
