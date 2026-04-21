import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Res,
  HttpCode,
} from '@nestjs/common';
import { SocketService } from 'src/common/services/socket/socket.service';

@Controller('debug')
export class DebugController {
  constructor(private readonly socketService: SocketService) {}

  @Get('monitor')
  serveMonitor(@Res() res) {
    res.sendFile('socket-monitor.html');
  }

  @Get('online-users')
  async getOnlineUsers() {
    const mappings = await this.socketService.getAllSocketMappings();

    const users = Object.entries(mappings).map(([userId, socketIds]) => ({
      user_id: Number(userId),
      socket_count: (socketIds as string[]).length,
      socket_ids: socketIds as string[],
    }));

    return { users };
  }

  @Post('kick-user/:userId')
  @HttpCode(200)
  async kickUser(@Param('userId', ParseIntPipe) userId: number) {
    await this.socketService.disconnectUser(userId, 'Kicked via debug monitor');
    return { userId, disconnected: true };
  }
}
