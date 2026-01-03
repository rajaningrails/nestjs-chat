import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { SocketService } from 'src/common/services/socket/socket.service';

@WebSocketGateway()
export class GroupGateway {
  constructor(private readonly socketService: SocketService) {}

  @SubscribeMessage('join-group')
  async handleJoinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { group_id: number; user_id: number },
  ) {
    const roomId = `group:${data.group_id}`;
    await this.socketService.joinRoom(client.id, roomId, data.user_id);

    // Notify others in the group
    await this.socketService.emitToRoom(roomId, 'user-joined-group', {
      group_id: data.group_id,
      user_id: data.user_id,
      timestamp: new Date(),
    });

    return { success: true, room: roomId };
  }

  @SubscribeMessage('leave-group')
  async handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { group_id: number; user_id: number },
  ) {
    const roomId = `group:${data.group_id}`;
    await this.socketService.leaveRoom(client.id, roomId, data.user_id);

    // Notify others
    await this.socketService.emitToRoom(roomId, 'user-left-group', {
      group_id: data.group_id,
      user_id: data.user_id,
      timestamp: new Date(),
    });

    return { success: true };
  }

  /**
   * Emit group created event to all members
   */
  async emitGroupCreated(groupId: number, memberIds: number[], groupData: any) {
    await this.socketService.emitToUsers(memberIds, 'group-created', {
      group_id: groupId,
      ...groupData,
    });
  }

  /**
   * Emit group updated event
   */
  async emitGroupUpdated(groupId: number, updateData: any) {
    const roomId = `group:${groupId}`;
    await this.socketService.emitToRoom(roomId, 'group-updated', {
      group_id: groupId,
      ...updateData,
    });
  }

  /**
   * Emit member added to group
   */
  async emitMemberAdded(groupId: number, newMemberId: number, addedBy: number) {
    const roomId = `group:${groupId}`;

    // Notify existing members
    await this.socketService.emitToRoom(roomId, 'member-added', {
      group_id: groupId,
      user_id: newMemberId,
      added_by: addedBy,
      timestamp: new Date(),
    });

    // Notify the new member
    await this.socketService.emitToUser(newMemberId, 'added-to-group', {
      group_id: groupId,
      added_by: addedBy,
      timestamp: new Date(),
    });
  }

  /**
   * Emit member removed from group
   */
  async emitMemberRemoved(
    groupId: number,
    removedMemberId: number,
    removedBy: number,
  ) {
    const roomId = `group:${groupId}`;

    // Notify remaining members
    await this.socketService.emitToRoom(roomId, 'member-removed', {
      group_id: groupId,
      user_id: removedMemberId,
      removed_by: removedBy,
      timestamp: new Date(),
    });

    // Notify the removed member
    await this.socketService.emitToUser(removedMemberId, 'removed-from-group', {
      group_id: groupId,
      removed_by: removedBy,
      timestamp: new Date(),
    });
  }
  async emitGroupDeleted(groupId: number, memberIds: number[]) {
    // Notify all members
    await this.socketService.emitToUsers(memberIds, 'group-deleted', {
      group_id: groupId,
      timestamp: new Date(),
    });

    // Clear room from Redis
    await this.socketService.clearRoom(`group:${groupId}`);
  }
}
