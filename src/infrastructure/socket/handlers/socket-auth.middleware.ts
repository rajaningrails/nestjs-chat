import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

const logger = new Logger('SocketAuthMiddleware');

export const socketAuthMiddleware = (socket: Socket, next: (err?: any) => void) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    const userId = socket.handshake.query.userId;

    if (!userId) {
      logger.warn(`Connection rejected: No userId provided`);
      return next(new Error('Authentication error: userId required'));
    }

    // TODO: Validate JWT token here
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // if (decoded.userId !== parseInt(userId as string)) {
    //   return next(new Error('Authentication error: Invalid token'));
    // }

    socket.data.userId = parseInt(userId as string);
    socket.data.authenticatedAt = new Date();

    logger.log(`✅ Socket authenticated for user ${userId}`);
    next();
  } catch (error) {
    logger.error('Socket authentication error:', error);
    next(new Error('Authentication error'));
  }
};