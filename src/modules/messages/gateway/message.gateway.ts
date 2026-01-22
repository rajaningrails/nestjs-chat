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
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 60000,
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
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      let userId: string | number = client.handshake.query?.sender_id as string;
      if (!userId) {
        this.logger.warn(`Connection rejected: No user ID`, client.handshake);
        client.disconnect();
        return;
      }
      userId = Number(userId);
      client.userId = userId;

      const success = await this.socketService.addUserSocket(userId, client.id);

      if (!success) {
        this.logger.error(`Failed to register socket for user ${userId}`);
        client.disconnect();
        return;
      }

      await this.presenceService.setOnline(userId);

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

  private clearHeartbeat(socketId: string) {
    const timeout = this.heartbeatTimeouts.get(socketId);
    if (timeout) {
      clearTimeout(timeout);
      this.heartbeatTimeouts.delete(socketId);
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { 
      conversation_id: number; 
      is_typing: boolean;
      group_id?: number;
      receiver_id?: number;
    },
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      await this.typingService.startTyping(data.conversation_id, userId);

      const typingData = {
        conversation_id: data.conversation_id,
        user_id: userId,
        is_typing: data.is_typing,
        timestamp: new Date(),
      };

      if (data.group_id) {
        // Group chat - emit to all group members except sender
        await this.socketService.emitToGroupMembers(
          data.group_id,
          'typing',
          typingData,
          userId, // exclude sender
        );
      } else if (data.receiver_id) {
        // One-to-one chat - emit to receiver only
        await this.socketService.emitToUser(
          data.receiver_id,
          'typing',
          typingData,
        );
      }
    } catch (error) {
      this.logger.error('Failed to handle typing indicator:', error);
    }
  }

  @SubscribeMessage('mark-seen')
  async handleMarkSeen(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { 
      message_id: number; 
      conversation_id: number;
      group_id?: number;
      sender_id?: number;
      receiver_id?: number
    },
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      if (data?.group_id) {
        await this.messageService.groupChatMessageSeen({
          conversationID: data.conversation_id,
          groupID: data.group_id,
          messageId: data.message_id,
          senderID: data.sender_id!,
        });
        
        // Emit to all group members including the one who marked it seen
        await this.socketService.emitToGroupMembers(
          data.group_id,
          'message-seen',
          {
            conversation_id: data.conversation_id,
            message_id: data.message_id,
            seen_by: userId,
            timestamp: new Date(),
          },
        );
      } else {
        await this.messageService.oneToOneChatMessageSeen({
          conversationID: data.conversation_id,
          messageId: data.message_id,
          senderID: data.sender_id!,
          receiverID: data.receiver_id!,
        });
        
        // Emit to both sender and the one who marked it seen
        const userIds = [userId];
        if (data.sender_id && data.sender_id !== userId) {
          userIds.push(data.sender_id);
        }

        await this.socketService.emitToUsers(
          userIds,
          'message-seen',
          {
            conversation_id: data.conversation_id,
            message_id: data.message_id,
            seen_by: userId,
            timestamp: new Date(),
          },
        );
      }
    } catch (error) {
      this.logger.error('Failed to handle mark-seen:', error);
      client.emit('error', {
        event: 'mark-seen',
        error: 'Failed to mark message as seen',
      });
    }
  }

  async emitGroupCreated(
    conversationId: number,
    memberIds: number[],
    groupData: any,
  ) {
    try {
      await this.socketService.emitToUsers(
        memberIds,
        'group-created',
        {
          conversation_id: conversationId,
          conversation: groupData,
          timestamp: new Date(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to emit group created event:', error);
    }
  }

  async emitGroupUpdated(
    conversationId: number,
    groupId: number,
    updates: any,
    updatedBy: number,
  ) {
    try {
      // Emit to all group members including the updater
      await this.socketService.emitToGroupMembers(
        groupId,
        'group-updated',
        {
          conversation_id: conversationId,
          updates,
          updated_by: updatedBy,
          timestamp: new Date(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to emit group updated event:', error);
    }
  }

  async emitMemberAdded(
    conversationId: number,
    groupId: number,
    newMemberIds: number[],
    addedBy: number,
    groupData: any,
  ) {
    try {
      // Emit to existing group members (excluding new members)
      await this.socketService.emitToGroupMembers(
        groupId,
        'member-added',
        {
          conversation_id: conversationId,
          new_members: newMemberIds,
          added_by: addedBy,
          timestamp: new Date(),
        },
        undefined,
        newMemberIds, // exclude new members from this event
      );

      // Emit to new members separately with full group data
      for (const memberId of newMemberIds) {
        await this.socketService.emitToUser(memberId, 'added-to-group', {
          conversation_id: conversationId,
          conversation: groupData,
          added_by: addedBy,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Failed to emit member added event:', error);
    }
  }

  async emitMemberRemoved(
    conversationId: number,
    groupId: number,
    removedMemberId: number,
    removedBy: number,
  ) {
    try {
      // Emit to remaining group members
      await this.socketService.emitToGroupMembers(
        groupId,
        'member-removed',
        {
          conversation_id: conversationId,
          removed_member: removedMemberId,
          removed_by: removedBy,
          timestamp: new Date(),
        },
      );

      // Notify the removed member
      await this.socketService.emitToUser(
        removedMemberId,
        'removed-from-group',
        {
          conversation_id: conversationId,
          removed_by: removedBy,
          timestamp: new Date(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to emit member removed event:', error);
    }
  }

  async emitGroupDeleted(
    conversationId: number,
    groupId: number,
    deletedBy: number,
  ) {
    try {
      // Emit to all group members including the one who deleted it
      await this.socketService.emitToGroupMembers(
        groupId,
        'group-deleted',
        {
          conversation_id: conversationId,
          deleted_by: deletedBy,
          timestamp: new Date(),
        },
      );
    } catch (error) {
      this.logger.error('Failed to emit group deleted event:', error);
    }
  }

  async emitNewMessage(
    conversationId: number,
    message: any,
    senderId: number,
    receiverId?: number,
    groupId?: number,
  ) {
    try {
      const messageData = {
        conversation_id: conversationId,
        message,
        timestamp: new Date(),
      };

      if (groupId) {
        // Group message - emit to all group members including sender
        await this.socketService.emitToGroupMembers(
          groupId,
          'message',
          messageData,
        );
      } else if (receiverId) {
        // One-to-one message - emit to both sender and receiver
        await this.socketService.emitToUsers(
          [senderId, receiverId],
          'message',
          messageData,
        );
      }
    } catch (error) {
      this.logger.error('Failed to emit new message event:', error);
    }
  }

  async emitMessageDeleted(
    conversationId: number,
    messageId: number,
    senderId: number,
    receiverId?: number,
    groupId?: number,
  ) {
    try {
      const deleteData = {
        conversation_id: conversationId,
        message_id: messageId,
        sender_id: senderId,
        timestamp: new Date(),
      };

      if (groupId) {
        // Group message deletion - emit to all group members including sender
        await this.socketService.emitToGroupMembers(
          groupId,
          'message-deleted',
          { ...deleteData, group_id: groupId },
        );
      } else if (receiverId) {
        // One-to-one message deletion - emit to both sender and receiver
        await this.socketService.emitToUsers(
          [senderId, receiverId],
          'message-deleted',
          deleteData,
        );
      }
    } catch (error) {
      this.logger.error('Failed to emit message deleted event:', error);
    }
  }
}