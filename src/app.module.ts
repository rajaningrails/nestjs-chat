import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { DatabaseModule } from './infrastructure/database/database.module';
import { databaseConfig } from './infrastructure/config/database.config';
import { CommonModule } from './common/common.module';
import { loggerConfig } from './infrastructure/config/logger.config';
import { UsersModule } from './modules/users/users.module';
import { ConversationsModule } from './modules/conversations/conversation.module';
import { MessageModule } from './modules/messages/message.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { SocketModule } from './infrastructure/socket/socket.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ThrottleModule } from './common/throttler/throttler.module';
import { APP_GUARD } from '@nestjs/core';
import { HmacAuthGuard } from './common/guard/hmac-auth.guard';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: '.env',
    }),

    // Logging
    WinstonModule.forRoot(loggerConfig),

    // Database
    DatabaseModule,

    // Common utilities
    SocketModule,
    RedisModule,
    QueueModule,
    CommonModule,
    ThrottleModule,

    // Feature modules
    HealthModule,
    UsersModule,
    ConversationsModule,
    MessageModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: HmacAuthGuard, // for authentication of incoming requests
    },
  ],
})
export class AppModule {}
