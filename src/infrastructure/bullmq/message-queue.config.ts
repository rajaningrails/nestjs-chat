import { BullModule } from "@nestjs/bullmq";
import { MessageProcessorConfig } from "./size-queue.config";

export const messageQueueConfig = BullModule.registerQueue({
  name: MessageProcessorConfig.queue_name,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    priority: MessageProcessorConfig.priority,
    removeOnFail: false,
  },
});