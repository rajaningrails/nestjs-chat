import { Injectable } from '@nestjs/common';
import { SocketService } from 'src/common/services/socket/socket.service';
import { GroupGateway } from '../gateway/group.gateway';

@Injectable()
export class GroupService {
  constructor(
    private readonly socketService: SocketService,
    private readonly groupGateway: GroupGateway,
  ) {}

  async createGroup(name: string, creatorId: number, memberIds: number[]) {
    // Save group to database
    const group = {
      id: 123, // from DB
      name,
      creator_id: creatorId,
      members: memberIds,
      created_at: new Date(),
    };

    // Emit to all members via socket
    await this.groupGateway.emitGroupCreated(group.id, memberIds, group);

    return group;
  }

  async updateGroup(groupId: number, updateData: any) {
    // Update in database
    // ...

    // Emit to all group members
    await this.groupGateway.emitGroupUpdated(groupId, updateData);

    return { success: true };
  }

  async addMember(groupId: number, newMemberId: number, addedBy: number) {
    // Add to database
    // ...

    // Emit events via socket
    await this.groupGateway.emitMemberAdded(groupId, newMemberId, addedBy);

    return { success: true };
  }

  async removeMember(groupId: number, memberId: number, removedBy: number) {
    // Remove from database
    // ...

    // Emit events via socket
    await this.groupGateway.emitMemberRemoved(groupId, memberId, removedBy);

    return { success: true };
  }

  async deleteGroup(groupId: number, memberIds: number[]) {
    // Delete from database
    // ...

    // Notify all members and cleanup
    await this.groupGateway.emitGroupDeleted(groupId, memberIds);

    return { success: true };
  }

  async checkOnlineMembers(memberIds: number[]): Promise<number[]> {
    const onlineMembers: number[] = [];
    
    for (const memberId of memberIds) {
      const isOnline = await this.socketService.isUserOnline(memberId);
      if (isOnline) {
        onlineMembers.push(memberId);
      }
    }

    return onlineMembers;
  }
}