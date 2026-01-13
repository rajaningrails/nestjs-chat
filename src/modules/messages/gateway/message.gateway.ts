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
import { Logger } from '@nestjs/common';
import { SocketService } from 'src/common/services/socket/socket.service';
import { PresenceService } from 'src/common/services/socket/presence.service';
import { ConversationService } from 'src/modules/conversations/services/conversation.service';
import { TypingService } from 'src/common/services/socket/typing.service';
import { MessageService } from '../services/message.service';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  schoolId?: number;
}

@WebSocketGateway({
  cors: {
    // origin: process.env.ALLOWED_ORIGINS,
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 25000,
})
export class MessageGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessageGateway.name);
  private readonly heartbeatTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly socketService: SocketService,
    private readonly typingService: TypingService,
    private readonly presenceService: PresenceService,
    private readonly conversationService: ConversationService,
    private readonly messageService: MessageService,
  ) {}

  afterInit(server: Server) {
    this.socketService.setServer(server);
    this.logger.log('🚀 WebSocket Gateway initialized');
    // this.setupServerMiddleware();
  }

  // private setupServerMiddleware() {
  //   this.server.use(async (socket: AuthenticatedSocket, next) => {
  //     try {
  //       // const token =
  //       //   socket.handshake.auth?.token ||
  //       //   socket.handshake.headers?.authorization?.replace('Bearer ', '');

  //       // if (!token) {
  //       //   return next(new Error('Authentication required'));
  //       // }

  //       // const payload = await this.jwtService.verifyAsync(token);

  //       // socket.userId = payload.sub || payload.userId;
  //       // socket.schoolId = payload.schoolId;

  //       next();
  //     } catch (error) {
  //       this.logger.error('Authentication failed:', error);
  //       // next(new Error('Invalid token'));
  //     }
  //   });
  // }

  /**
   * Handle new client connection
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      let userId: string | number = client.handshake.query?.sender_id as string;
      if (!userId) {
        this.logger.warn(`Connection rejected: No user ID`, client.handshake);
        client.disconnect();
        return;
      }
      userId = Number(userId);
      const success = await this.socketService.addUserSocket(userId, client.id);

      if (!success) {
        this.logger.error(`Failed to register socket for user ${userId}`);
        client.disconnect();
        return;
      }

      await this.presenceService.setOnline(userId);

      await this.joinUserConversations(client, userId);

      this.setupHeartbeat(client, userId);

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

      this.clearHeartbeat(client.id);

      await this.socketService.removeUserSocket(userId, client.id);

      const isStillOnline = await this.socketService.isUserOnline(userId);

      if (!isStillOnline) {
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
    this.clearHeartbeat(client.id);

    client.on('pong', async () => {
      this.clearHeartbeat(client.id);

      const timeout = setTimeout(() => {
        this.presenceService.setOffline(userId);
        client.disconnect();
      }, 25000);

      this.heartbeatTimeouts.set(client.id, timeout);
    });

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
    userId: number,
  ): Promise<void> {
    try {
      const conversations =
        await this.conversationService.getUserConversations(userId);

      for (const conversation of conversations) {
        const roomId = `conversation:${conversation.id}`;
        await this.socketService.joinRoom(client.id, roomId, userId);
      }

      this.logger.log(
        `User ${userId} joined ${conversations.length} conversation rooms`,
      );
    } catch (error) {
      this.logger.error('Failed to join user conversations:', error);
    }
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id: number; is_typing: boolean },
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      await this.typingService.startTyping(data.conversation_id, userId);
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
    @MessageBody() data: { message_id: number; group_id: number },
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      if (data?.group_id) {
        this.messageService.groupChatMessageSeen(data.message_id);
      } else {
        this.messageService.oneToOneChatMessageSeen(data.message_id);
      }
    } catch (error) {
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
    @MessageBody() data: { conversation_id: number },
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
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
    @MessageBody() data: { conversation_id: number },
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

  async emitGroupCreated(
    conversationId: number,
    memberIds: number[],
    groupData: any,
  ) {
    try {
      await this.socketService.emitToUsers(memberIds, 'group-created', {
        conversation_id: conversationId,
        conversation: groupData,
        timestamp: new Date(),
      });

      this.logger.log(
        `Group ${conversationId} created, notified ${memberIds.length} members`,
      );
    } catch (error) {
      this.logger.error('Failed to emit group created event:', error);
    }
  }

  async emitGroupUpdated(
    conversationId: number,
    updates: any,
    updatedBy: number,
  ) {
    try {
      const roomId = `conversation:${conversationId}`;
      await this.socketService.emitToRoom(roomId, 'group-updated', {
        conversation_id: conversationId,
        updates,
        updated_by: updatedBy,
        timestamp: new Date(),
      });

      this.logger.log(`Group ${conversationId} updated by user ${updatedBy}`);
    } catch (error) {
      this.logger.error('Failed to emit group updated event:', error);
    }
  }

  async emitMemberAdded(
    conversationId: number,
    newMemberIds: number[],
    addedBy: number,
    groupData: any,
  ) {
    try {
      const roomId = `conversation:${conversationId}`;

      await this.socketService.emitToRoom(
        roomId,
        'member-added',
        {
          conversation_id: conversationId,
          new_members: newMemberIds,
          added_by: addedBy,
          timestamp: new Date(),
        },
        addedBy,
      );

      for (const memberId of newMemberIds) {
        const sockets = await this.socketService.getUserSockets(memberId);

        for (const socketId of sockets) {
          await this.socketService.joinRoom(socketId, roomId, memberId);
        }

        await this.socketService.emitToUser(memberId, 'added-to-group', {
          conversation_id: conversationId,
          conversation: groupData,
          added_by: addedBy,
          timestamp: new Date(),
        });
      }

      this.logger.log(
        `Added ${newMemberIds.length} members to group ${conversationId}`,
      );
    } catch (error) {
      this.logger.error('Failed to emit member added event:', error);
    }
  }

  async emitMemberRemoved(
    conversationId: number,
    removedMemberId: number,
    removedBy: number,
  ) {
    try {
      const roomId = `conversation:${conversationId}`;

      await this.socketService.emitToRoom(roomId, 'member-removed', {
        conversation_id: conversationId,
        removed_member: removedMemberId,
        removed_by: removedBy,
        timestamp: new Date(),
      });

      const sockets = await this.socketService.getUserSockets(removedMemberId);
      for (const socketId of sockets) {
        await this.socketService.leaveRoom(socketId, roomId, removedMemberId);
      }

      await this.socketService.emitToUser(
        removedMemberId,
        'removed-from-group',
        {
          conversation_id: conversationId,
          removed_by: removedBy,
          timestamp: new Date(),
        },
      );

      this.logger.log(
        `Removed user ${removedMemberId} from group ${conversationId}`,
      );
    } catch (error) {
      this.logger.error('Failed to emit member removed event:', error);
    }
  }

  async emitGroupDeleted(conversationId: number, deletedBy: number) {
    try {
      const roomId = `conversation:${conversationId}`;

      await this.socketService.emitToRoom(roomId, 'group-deleted', {
        conversation_id: conversationId,
        deleted_by: deletedBy,
        timestamp: new Date(),
      });

      await this.socketService.clearRoom(roomId);

      this.logger.log(`Group ${conversationId} deleted by user ${deletedBy}`);
    } catch (error) {
      this.logger.error('Failed to emit group deleted event:', error);
    }
  }

  async emitNewMessage(conversationId: number, message: any, senderId: number) {
    try {
      const roomId = `conversation:${conversationId}`;

      await this.socketService.emitToRoom(
        roomId,
        'new-message',
        {
          conversation_id: conversationId,
          message,
          timestamp: new Date(),
        },
        senderId,
      );

      this.logger.log(
        `New message in conversation ${conversationId} from user ${senderId}`,
      );
    } catch (error) {
      this.logger.error('Failed to emit new message event:', error);
    }
  }

  async emitMessageDeleted(
    conversationId: number,
    messageId: number,
    deletedBy: number,
  ) {
    try {
      const roomId = `conversation:${conversationId}`;

      await this.socketService.emitToRoom(roomId, 'message-deleted', {
        conversation_id: conversationId,
        message_id: messageId,
        deleted_by: deletedBy,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to emit message deleted event:', error);
    }
  }
}
