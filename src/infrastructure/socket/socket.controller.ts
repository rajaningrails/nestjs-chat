import { Controller, Get } from '@nestjs/common';
import { SocketService } from 'src/common/services/socket/socket.service';

@Controller('socket-health')
export class SocketHealthController {
  constructor(private readonly socketService: SocketService) {}

  @Get()
  async getHealth() {
    const onlineUsers = await this.socketService.getOnlineUsers();
    const connectionCount = this.socketService.getConnectionCount();

    return {
      status: 'healthy',
      connections: connectionCount,
      online_users: onlineUsers.length,
      timestamp: new Date().toISOString(),
    };
  }
}