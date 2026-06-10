import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const logger = new Logger('SocketAuthMiddleware');

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void) => {
  try {
    const secret = process.env.SECRET;
    if (!secret) {
      return next(new Error('Server misconfiguration'));
    }

    const signature = (socket.handshake.auth.signature || socket.handshake.query.signature) as string;
    const timestamp = (socket.handshake.auth.timestamp || socket.handshake.query.timestamp) as string;
    const senderId = (socket.handshake.auth.sender_id || socket.handshake.query.sender_id) as string;

    if (!senderId) {
      logger.warn('Connection rejected: missing sender_id');
      return next(new Error('Authentication error: sender_id required'));
    }

    if (!signature || !timestamp) {
      logger.warn(`Connection rejected: missing signature or timestamp (user ${senderId})`);
      return next(new Error('Authentication error: signature required'));
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > 5 * 60 * 1000) {
      return next(new Error('Authentication error: timestamp expired'));
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}:${senderId}`)
      .digest('hex');

    let sigBuf: Buffer;
    let expBuf: Buffer;
    try {
      sigBuf = Buffer.from(signature, 'hex');
      expBuf = Buffer.from(expected, 'hex');
    } catch {
      return next(new Error('Authentication error: invalid signature format'));
    }

    if (
      sigBuf.length === 0 ||
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      logger.warn(`Connection rejected: invalid signature (user ${senderId})`);
      return next(new Error('Authentication error: invalid signature'));
    }

    const userIdNum = parseInt(senderId, 10);
    if (!Number.isFinite(userIdNum) || userIdNum <= 0) {
      return next(new Error('Authentication error: invalid sender_id'));
    }

    socket.data.userId = userIdNum;
    socket.data.authenticatedAt = new Date();

    next();
  } catch (error) {
    logger.error('Socket authentication error:', error);
    next(new Error('Authentication error'));
  }
};