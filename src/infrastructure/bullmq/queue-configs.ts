import { BullModule } from "@nestjs/bullmq";

export const messageQueueConfig = BullModule.registerQueue({
  name: 'messages',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 100, // Keep last 100 completed jobs
      age: 3600, // 1 hour
    },
    removeOnFail: {
      count: 1000, // Keep last 1000 failed jobs
      age: 86400, // 24 hours
    },
  },
});