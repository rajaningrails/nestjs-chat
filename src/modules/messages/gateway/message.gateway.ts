import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { SocketService } from 'src/common/services/socket/socket.service';
import { PresenceService } from 'src/common/services/socket/presence.service';
import { TypingService } from 'src/common/services/socket/typing.service';
import { SocketRateLimiter } from 'src/common/services/socket/socket-rate-limiter';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class MessageGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessageGateway.name);

  constructor(
    private readonly socketService: SocketService,
    private readonly presenceService: PresenceService,
    private readonly typingService: TypingService,
    private readonly rateLimiter: SocketRateLimiter,
  ) {}

  afterInit(server: Server) {
    this.socketService.setServer(server);
    this.logger.log('✅ Enhanced WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    const userId = this.extractUserId(client);

    if (!userId) {
      client.disconnect(true);
      return;
    }

    // Store socket
    await this.socketService.addUserSocket(userId, client.id);

    // Set user as online
    await this.presenceService.setOnline(userId);

    // Log connection
    // this.eventLogger.logConnection(userId, client.id);

    this.logger.log(`✅ User ${userId} connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const userId = await this.socketService.getUserIdBySocket(client.id);

    if (userId) {
      await this.socketService.removeUserSocket(userId, client.id);

      // Check if user has other active sockets
      const isStillOnline = await this.socketService.isUserOnline(userId);

      if (!isStillOnline) {
        // No more active sockets, set as offline
        await this.presenceService.setOffline(userId);
      }

      // this.eventLogger.logDisconnection(userId, client.id);
    }
  }

  @SubscribeMessage('typing-start')
  async handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: number },
  ) {
    const userId = client.data.userId;

    // Rate limit: 10 typing events per minute
    const { allowed } = await this.rateLimiter.checkRateLimit(
      userId,
      'typing',
      10,
      60000,
    );

    if (!allowed) return { success: false, error: 'Rate limit exceeded' };

    await this.typingService.startTyping(data.conversation_id, userId);
    return { success: true };
  }

  @SubscribeMessage('typing-stop')
  async handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversation_id: number },
  ) {
    const userId = client.data.userId;
    await this.typingService.stopTyping(data.conversation_id, userId);
    return { success: true };
  }

  // @SubscribeMessage('get-presence')
  // async handleGetPresence(
  //   @ConnectedSocket() client: Socket,
  //   @MessageBody() data: { user_ids: number[] },
  // ) {
  //   const presenceMap = await this.presenceService.getBulkPresence(data.user_ids);
    
  //   return {
  //     success: true,
  //     presence: Array.from(presenceMap.values()),
  //   };
  // }

  private extractUserId(client: Socket): number | null {
    const userId = client.handshake.query.userId as string;
    return userId ? parseInt(userId) : null;
  }
}