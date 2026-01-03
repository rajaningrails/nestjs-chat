import { Module, Global } from '@nestjs/common';
import { PresenceService } from 'src/common/services/socket/presence.service';
import { SocketRateLimiter } from 'src/common/services/socket/socket-rate-limiter';
import { SocketService } from 'src/common/services/socket/socket.service';
import { TypingService } from 'src/common/services/socket/typing.service';
import { SocketHealthController } from './socket.controller';

@Global()
@Module({
  providers: [
    SocketService,
    PresenceService,
    TypingService,
    SocketRateLimiter,
  ],
  exports: [
    SocketService,
    PresenceService,
    TypingService,
    SocketRateLimiter,
  ],
  controllers: [SocketHealthController]
})
export class SocketModule {}
