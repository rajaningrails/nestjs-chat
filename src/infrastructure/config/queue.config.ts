import { registerAs } from '@nestjs/config';

export const queueConfig = registerAs('queue', () => ({
  redis: {
      url: process.env.REDIS_URL,
  },
}));
