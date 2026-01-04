import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ChatThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const schoolId = req.headers['x-school-id'];
    const userId = req.headers['x-user-id'];

    if (!schoolId || !userId) {
      throw new Error('Missing required headers: x-school-id or x-user-id');
    }

    return `school_${schoolId}_user_${userId}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttler: any,
  ) {
    const { limit, timeToExpire } = throttler;
    throw new Error(`Too many requests. Limit: ${limit}. Retry after ${timeToExpire}s.`);
  }
}