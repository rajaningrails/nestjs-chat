import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class HmacAuthGuard implements CanActivate {
  private readonly secret: string;

  constructor(private reflector: Reflector) {
    const secret = process.env.SECRET;
    if (!secret) {
      throw new InternalServerErrorException(
        'SECRET environment variable is not set',
      );
    }
    this.secret = secret;
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const headers = request.headers as unknown as Record<string, string>;

    const signature = headers['x-signature'];
    const timestamp = headers['x-timestamp'];
    const schoolId = headers['x-app-id'];
    const userId = headers['x-app-user-id'];
    const method = (request as any).method as string;
    const url = (request as any).url as string;

    if (!signature || !timestamp || !schoolId || !userId) {
      throw new UnauthorizedException('Missing auth headers');
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
      throw new UnauthorizedException('Request expired or invalid timestamp');
    }

    // Sign timestamp + method + path to prevent cross-endpoint replay
    const payload = `${timestamp}:${method.toUpperCase()}:${url.split('?')[0]}`;
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    let sigBuf: Buffer;
    let expBuf: Buffer;
    try {
      sigBuf = Buffer.from(signature, 'hex');
      expBuf = Buffer.from(expected, 'hex');
    } catch {
      throw new UnauthorizedException('Invalid signature format');
    }

    if (
      sigBuf.length === 0 ||
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
