import { Module, Global } from '@nestjs/common';
import { PresenceService } from 'src/common/services/socket/presence.service';
import { SocketService } from 'src/common/services/socket/socket.service';
import { TypingService } from 'src/common/services/socket/typing.service';
import { SocketHealthController } from './socket.controller';
import { SocketRateLimiter } from './handlers/socket-rate-limiter';
import { GroupModule } from 'src/modules/group/group.module';

@Global()
@Module({
  imports: [GroupModule],
  providers: [SocketService, PresenceService, TypingService, SocketRateLimiter],
  exports: [SocketService, PresenceService, TypingService, SocketRateLimiter],
  controllers: [SocketHealthController],
})
export class SocketModule {}
