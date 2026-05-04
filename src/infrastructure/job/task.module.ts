import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SocketCleanupJob } from './socket-cleanup.job';
import { SocketModule } from '../socket/socket.module';
import { MessageModule } from 'src/modules/messages/message.module';
import { ConversationsModule } from 'src/modules/conversations/conversations.module';

@Module({
  imports: [
    ScheduleModule.forRoot(), 
    SocketModule,             
    MessageModule,           
    ConversationsModule,      
  ],
  providers: [SocketCleanupJob],
})
export class TasksModule {}