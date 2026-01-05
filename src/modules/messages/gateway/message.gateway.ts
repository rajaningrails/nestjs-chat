import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { SocketService } from 'src/common/services/socket/socket.service';
import { PresenceService } from 'src/common/services/socket/presence.service';
import { MessageService } from '../services/message.service';
import { ConversationService } from 'src/modules/conversations/services/conversation.service';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  schoolId?: number;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
})
export class MessageGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessageGateway.name);
  private readonly heartbeatTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly socketService: SocketService,
    private readonly presenceService: PresenceService,
    private readonly messageService: MessageService,
    private readonly conversationService: ConversationService
  ) { }

  afterInit(server: Server) {
    this.socketService.setServer(server);
    this.logger.log('🚀 WebSocket Gateway initialized');
    this.setupServerMiddleware();
  }

  /**
   * Setup authentication middleware
   */
  private setupServerMiddleware() {
    this.server.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // const token = 
        //   socket.handshake.auth?.token || 
        //   socket.handshake.headers?.authorization?.replace('Bearer ', '');

        // if (!token) {
        //   return next(new Error('Authentication required'));
        // }

        // const payload = await this.jwtService.verifyAsync(token);

        // socket.userId = payload.sub || payload.userId;
        // socket.schoolId = payload.schoolId;

        next();
      } catch (error) {
        this.logger.error('Authentication failed:', error);
        // next(new Error('Invalid token'));
      }
    });
  }

  /**
   * Handle new client connection
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      const userId = client.userId;

      if (!userId) {
        this.logger.warn(`Connection rejected: No user ID`);
        client.disconnect();
        return;
      }

      // Store socket mapping
      const success = await this.socketService.addUserSocket(userId, client.id);

      if (!success) {
        this.logger.error(`Failed to register socket for user ${userId}`);
        client.disconnect();
        return;
      }

      // Set user as online
      await this.presenceService.setOnline(userId);

      // Build presence audience (get user's contacts)
      const contacts = await this.conversationService.getUserContacts(userId);
      await this.presenceService.buildPresenceAudience(
        userId,
        contacts.map(c => c.id)
      );

      // Join user's conversation rooms
      await this.joinUserConversations(client, userId);

      // Send any undelivered messages
      await this.sendUndeliveredMessages(client, userId);

      // Setup heartbeat
      this.setupHeartbeat(client, userId);

      // Emit connection success
      client.emit('connected', {
        userId,
        socketId: client.id,
        timestamp: new Date(),
      });

      this.logger.log(`✅ User ${userId} connected (socket: ${client.id})`);
    } catch (error) {
      this.logger.error('Connection handling error:', error);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      const userId = client.userId;

      if (!userId) return;

      // Clear heartbeat
      this.clearHeartbeat(client.id);

      // Remove socket mapping
      await this.socketService.removeUserSocket(userId, client.id);

      // Check if user has other active connections
      const isStillOnline = await this.socketService.isUserOnline(userId);

      if (!isStillOnline) {
        // Set user as offline
        await this.presenceService.setOffline(userId);
      }

      this.logger.log(`👋 User ${userId} disconnected (socket: ${client.id})`);
    } catch (error) {
      this.logger.error('Disconnection handling error:', error);
    }
  }

  /**
   * Setup heartbeat monitoring
   */
  private setupHeartbeat(client: AuthenticatedSocket, userId: number) {
    // Clear any existing timeout
    this.clearHeartbeat(client.id);

    // Listen for pong
    client.on('pong', async () => {
      await this.presenceService.updateLastSeen(userId);

      // Reset timeout
      this.clearHeartbeat(client.id);

      const timeout = setTimeout(() => {
        this.logger.warn(`Heartbeat timeout for user ${userId}`);
        client.disconnect();
      }, 60000); // 60 second timeout

      this.heartbeatTimeouts.set(client.id, timeout);
    });

    // Send initial ping
    client.emit('ping');
  }

  /**
   * Clear heartbeat timeout
   */
  private clearHeartbeat(socketId: string) {
    const timeout = this.heartbeatTimeouts.get(socketId);
    if (timeout) {
      clearTimeout(timeout);
      this.heartbeatTimeouts.delete(socketId);
    }
  }

  /**
   * Join user to their conversation rooms
   */
  private async joinUserConversations(
    client: AuthenticatedSocket,
    userId: number
  ): Promise<void> {
    try {
      const conversations = await this.conversationService
        .getUserConversations(userId);

      for (const conversation of conversations) {
        const roomId = `conversation:${conversation.id}`;
        await this.socketService.joinRoom(client.id, roomId, userId);
      }

      this.logger.log(
        `User ${userId} joined ${conversations.length} conversation rooms`
      );
    } catch (error) {
      this.logger.error('Failed to join user conversations:', error);
    }
  }

  /**
   * Send undelivered messages to reconnected user
   */
  private async sendUndeliveredMessages(
    client: AuthenticatedSocket,
    userId: number
  ): Promise<void> {
    try {
      const undelivered = await this.messageService
        .getUndeliveredMessages(userId);

      if (undelivered.length > 0) {
        client.emit('undelivered-messages', undelivered);
        this.logger.log(
          `Sent ${undelivered.length} undelivered messages to user ${userId}`
        );
      }
    } catch (error) {
      this.logger.error('Failed to send undelivered messages:', error);
    }
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id: number; is_typing: boolean }
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      await this.messageService.emitTypingIndicator(
        data.conversation_id,
        userId,
        data.is_typing
      );
    } catch (error) {
      this.logger.error('Failed to handle typing indicator:', error);
    }
  }

  /**
   * Handle message seen
   */
  @SubscribeMessage('mark-seen')
  async handleMarkSeen(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { message_id: string }
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      await this.messageService.markMessageAsSeen(data.message_id, userId);
    } catch (error) {
      this.logger.error('Failed to mark message as seen:', error);
      client.emit('error', {
        event: 'mark-seen',
        error: 'Failed to mark message as seen',
      });
    }
  }

  /**
   * Handle join conversation
   */
  @SubscribeMessage('join-conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id: number }
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      // Verify user has access to this conversation
      // const hasAccess = await this.conversationService
      //   .userHasAccess(data.conversation_id, userId);

      // if (!hasAccess) {
      //   client.emit('error', {
      //     event: 'join-conversation',
      //     error: 'Access denied',
      //   });
      //   return;
      // }

      const roomId = `conversation:${data.conversation_id}`;
      await this.socketService.joinRoom(client.id, roomId, userId);

      client.emit('joined-conversation', {
        conversation_id: data.conversation_id,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to join conversation:', error);
      client.emit('error', {
        event: 'join-conversation',
        error: 'Failed to join conversation',
      });
    }
  }

  /**
   * Handle leave conversation
   */
  @SubscribeMessage('leave-conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id: number }
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      const roomId = `conversation:${data.conversation_id}`;
      await this.socketService.leaveRoom(client.id, roomId, userId);

      client.emit('left-conversation', {
        conversation_id: data.conversation_id,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to leave conversation:', error);
    }
  }

  /**
   * Handle user activity (update last seen)
   */
  @SubscribeMessage('activity')
  async handleActivity(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.userId;

    if (!userId) return;

    try {
      await this.presenceService.updateLastSeen(userId);
      await this.presenceService.setOnline(userId);
    } catch (error) {
      this.logger.error('Failed to handle activity:', error);
    }
  }

  /**
   * Get online status of users
   */
  @SubscribeMessage('get-online-status')
  async handleGetOnlineStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { user_ids: number[] }
  ) {
    try {
      const statuses = await this.presenceService
        .getOnlineStatuses(data.user_ids);

      const result = Object.fromEntries(statuses);

      client.emit('online-statuses', result);
    } catch (error) {
      this.logger.error('Failed to get online statuses:', error);
    }
  }
}