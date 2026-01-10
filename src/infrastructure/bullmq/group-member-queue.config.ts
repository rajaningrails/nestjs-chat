import { BullModule } from "@nestjs/bullmq";
import { GroupMemberProcessorConfig } from "./size-queue.config";

export const groupQueueConfig = BullModule.registerQueue({
  name: GroupMemberProcessorConfig.queue_name,
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
    priority: GroupMemberProcessorConfig.priority,
    removeOnFail: false,
  },
});