import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly secret = process.env.SECRET ?? 'vedachatappsecret';
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const headers = request.headers as any;

    const signature = headers['x-signature'];
    const timestamp = headers['x-timestamp'];
    const schoolId = headers['x-app-id'];
    const userId = headers['x-app-user-id'];

    if (!signature || !timestamp || !schoolId || !userId) {
      throw new UnauthorizedException('Missing auth headers');
    }

    const now = Date.now();
    const requestAgeMs = Math.abs(now - Number(timestamp));
    if (requestAgeMs > 5 * 60 * 1000) {
      throw new UnauthorizedException('Request expired');
    }

    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(timestamp)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
