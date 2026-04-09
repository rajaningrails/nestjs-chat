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
import { TypingService } from 'src/common/services/socket/typing.service';
import { MessageDto } from '../dto/message.dto';
import { User } from 'src/modules/users/entities/user.entity';
import { Conversation } from 'src/modules/conversations/entities/conversation.entity';
import { S3PresignedUrlService } from 'src/common/services/aws.service';
import { ChatGroup } from 'src/modules/group/entities/chat-group.entity';

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
  server!: Server;

  private readonly logger = new Logger(MessageGateway.name);
  private readonly heartbeatTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly socketService: SocketService,
    private readonly typingService: TypingService,
    private readonly presenceService: PresenceService,
    private readonly s3Service: S3PresignedUrlService,
  ) {}

  async afterInit(server: Server) {
    this.socketService.setServer(server);
    await this.socketService.clearAllSocketMappings();
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

      this.socketService.broadcast('userOnline', {
        senderId: userId,
      });
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

      this.socketService.broadcast('userOffline', {
        senderId: userId,
      });

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
    @MessageBody()
    data: {
      typing_state_conversation_id: number;
      typing_state_sender_id: number;
      typing_state_receiver_id: number;
    },
  ) {
    const userId = client.userId;

    if (!userId) return;
    try {
      await this.typingService.startTyping(data, userId);
    } catch (error) {
      this.logger.error('Failed to handle typing indicator:', error);
    }
  }

  @SubscribeMessage('stopTyping')
  async handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      typing_state_conversation_id: number;
      typing_state_sender_id: number;
      typing_state_receiver_id: number;
    },
  ) {
    const userId = client.userId;

    if (!userId) return;

    try {
      await this.typingService.stopTyping(data, userId);
    } catch (error) {
      this.logger.error('Failed to handle typing indicator:', error);
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
      await this.socketService.emitToGroupMembers(groupId, 'group-updated', {
        conversation_id: conversationId,
        updates,
        updated_by: updatedBy,
        timestamp: new Date(),
      });
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
        newMemberIds,
      );

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
      await this.socketService.emitToGroupMembers(groupId, 'member-removed', {
        conversation_id: conversationId,
        removed_member: removedMemberId,
        removed_by: removedBy,
        timestamp: new Date(),
      });

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
      await this.socketService.emitToGroupMembers(groupId, 'group-deleted', {
        conversation_id: conversationId,
        deleted_by: deletedBy,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to emit group deleted event:', error);
    }
  }

  async emitNewMessage(
    message: MessageDto,
    sender_user_details: User,
    receiver_user_details: User | null,
    conversation: Conversation,
    group_detail: ChatGroup | null
  ) {
    try {
      const presignedUrls = await Promise.all([
        this.s3Service.generatePresignedUrls(message.attachments!),
        this.s3Service.generatePresignedUrl(sender_user_details.image!),
        this.s3Service.generatePresignedUrl(receiver_user_details?.image!),
      ])
      const messageData = {
        status: true,
        message: 'Message sent successfully',
        data: {
          id: message.id,
          message: message?.message || '',
          attachments: presignedUrls?.[0] ?? [],
          conversation_id: message.conversation_id,
          seen_at: null,
          delete_at: null,
          not_show: 0,
          sender_id: message.sender_id,
          school_id: message.school_id,
          receiver_id: message.receiver_id,
          group_id: message.group_id,
          chat_reply_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          receiver_image: presignedUrls?.[2],
          isOnline: message?.receiver_id
            ? this.socketService.isUserOnline(message.receiver_id!)
            : false,
          isGroupMessage: message?.group_id ? true : false,
          user_details: {
            id: sender_user_details?.user_id?.toString(),
            name: sender_user_details?.name,
            image: presignedUrls?.[1],
            level: sender_user_details?.type,
          },
        },
      };

      const latestMessagePayload = {
        id: message?.conversation_id,
        user_id: message?.receiver_id,
        school_id: message?.school_id,
        sender_id: message?.sender_id,
        receiver_id: message?.receiver_id,
        type: conversation.type,
        group_id: message.group_id,
        created_at: new Date(),
        updated_at: new Date(),
        last_message_id: message?.id,
        last_message_seen_at: null,
        last_message_sender_id: message?.sender_id,
        last_message_date: new Date(),
        last_message: message?.message,
        is_only_teachers_group: conversation.group_type,
        last_message_receiver_type: receiver_user_details?.type,
        attachments: presignedUrls?.[0] ?? [],
        isOnline: message?.receiver_id
          ? this.socketService.isUserOnline(message.receiver_id!)
          : false,
        is_online: message?.receiver_id
          ? this.socketService.isUserOnline(message.receiver_id!)
          : false,
        group_name: group_detail?.group_name,
        isGroupMessage: message?.group_id ? true : false,
        group_image: group_detail?.group_image,
        user_details: {
          id: sender_user_details?.user_id?.toString(),
          name: sender_user_details?.name,
          image: presignedUrls?.[1],
          level: sender_user_details?.type,
        },
      };

      if (message?.group_id) {
        await this.socketService.emitToGroupMembers(
          message?.group_id,
          'message',
          messageData,
        );
        await this.socketService.emitToGroupMembers(
          message?.group_id,
          'latestMessageIndividual',
          latestMessagePayload,
        );
      } else if (message?.receiver_id) {
        await this.socketService.emitToUsers(
          [message.sender_id, message?.receiver_id],
          'message',
          messageData,
        );
        await this.socketService.emitToUsers(
          [message.sender_id, message?.receiver_id],
          'latestMessageIndividual',
          latestMessagePayload,
        );
      }
    } catch (error) {
      this.logger.error('Failed to emit new message event:', error);
    }
  }

  async emitMessageDeleted(request: {
    messageId: number;
    receiverID: number;
    senderID: number;
    conversationID: number;
    message_remover_name: string;
    groupID: number;
  }) {
    try {
      if (request?.groupID) {
        await this.socketService.emitToGroupMembers(
          request?.groupID,
          'messageDeleted',
          { ...request },
        );
      } else if (request?.receiverID) {
        await this.socketService.emitToUsers(
          [request?.senderID, request?.receiverID],
          'messageDeleted',
          request,
        );
      }
    } catch (error) {
      this.logger.error('Failed to emit message deleted event:', error);
    }
  }
}
