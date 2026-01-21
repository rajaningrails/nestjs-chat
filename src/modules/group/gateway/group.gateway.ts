import { WebSocketGateway } from '@nestjs/websockets';
import { SocketService } from 'src/common/services/socket/socket.service';

@WebSocketGateway()
export class GroupGateway {
  constructor(private readonly socketService: SocketService) {}

  async emitGroupCreated(groupId: number, memberIds: number[], groupData: any) {
    await this.socketService.emitToUsers(memberIds, 'group-created', {
      group_id: groupId,
      ...groupData,
    });
  }

  // async emitGroupUpdated(groupId: number, updateData: any) {
  //   const roomId = `group:${groupId}`;
  //   await this.socketService.emitToRoom(roomId, 'group-updated', {
  //     group_id: groupId,
  //     ...updateData,
  //   });
  // }

  // async emitMemberAdded(groupId: number, newMemberId: number, addedBy: number) {
  //   const roomId = `group:${groupId}`;

  //   await this.socketService.emitToRoom(roomId, 'member-added', {
  //     group_id: groupId,
  //     user_id: newMemberId,
  //     added_by: addedBy,
  //     timestamp: new Date(),
  //   });

  //   await this.socketService.emitToUser(newMemberId, 'added-to-group', {
  //     group_id: groupId,
  //     added_by: addedBy,
  //     timestamp: new Date(),
  //   });
  // }

  // async emitMemberRemoved(
  //   groupId: number,
  //   removedMemberId: number,
  //   removedBy: number,
  // ) {
  //   const roomId = `group:${groupId}`;

  //   await this.socketService.emitToRoom(roomId, 'member-removed', {
  //     group_id: groupId,
  //     user_id: removedMemberId,
  //     removed_by: removedBy,
  //     timestamp: new Date(),
  //   });

  //   await this.socketService.emitToUser(removedMemberId, 'removed-from-group', {
  //     group_id: groupId,
  //     removed_by: removedBy,
  //     timestamp: new Date(),
  //   });
  // }
}
