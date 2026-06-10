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
    // x-app-id and x-app-user-id are validated by HmacAuthGuard before this
    // runs, so they cannot be spoofed. Use them as the rate-limit key when present.
    const appId = req.headers['x-app-id'];
    const appUserId = req.headers['x-app-user-id'];

    if (appId && appUserId) {
      return `hmac:${appId}:${appUserId}`;
    }

    // Fallback: IP-based tracking (e.g. @Public() endpoints, health checks)
    const ip: string =
      req.ip ||
      req.socket?.remoteAddress ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      'unknown';

    return `ip:${ip}`;
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