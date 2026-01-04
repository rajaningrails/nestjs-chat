import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ChatThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const schoolId = req.headers['x-school-id'];
    const userId = req.headers['x-user-id'];

    if (schoolId && userId) {
      return `school_${schoolId}_user_${userId}`;
    }

    // Handles both direct IP and common proxy headers
    const ip =
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req.connection as any)?.socket?.remoteAddress ||
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      'unknown-ip';

    return `ip_${ip}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttler: any,
  ) {
    const { limit, timeToExpire } = throttler;
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests',
        error: 'Rate limit exceeded',
        limit,
        retryAfter: timeToExpire,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}