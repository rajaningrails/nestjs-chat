import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    @InjectQueue('messages') private messageQueue: Queue,
  ) {}

  @Get()
  @Public()
  async check() {
    return {
      uptime: process.uptime(),
      process: {
        pid: process.pid,
        memory: {
          used: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          total: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
          rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
        },
        cpu: process.cpuUsage(),
      },
    };
  }

  @Get('queues')
  async checkQueues() {
    const queues = [
      { name: 'messages', queue: this.messageQueue },
    ];

    const status = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);

        return {
          name,
          waiting,
          active,
          completed,
          failed,
          healthy: failed < 100 && active < 1000,
        };
      }),
    );

    return {
      timestamp: new Date(),
      queues: status,
      overall: status.every((q) => q.healthy),
    };
  }
}
