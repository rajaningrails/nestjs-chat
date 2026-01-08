import { BullModule } from "@nestjs/bullmq";
import { GroupProcessorConfig } from "./size-queue.config";

export const groupQueueConfig = BullModule.registerQueue({
  name: GroupProcessorConfig.queue_name,
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
    priority: GroupProcessorConfig.priority,
    removeOnFail: false,
  },
});