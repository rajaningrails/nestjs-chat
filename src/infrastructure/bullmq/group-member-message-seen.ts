import { BullModule } from "@nestjs/bullmq";
import { GroupMemberMessageSeenProcessorConfig } from "./size-queue.config";

export const groupQueueConfig = BullModule.registerQueue({
  name: GroupMemberMessageSeenProcessorConfig.queue_name,
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
    priority: GroupMemberMessageSeenProcessorConfig.priority,
    removeOnFail: false,
  },
});