import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupController } from './group.controller';
import { CreateGroupUseCase } from './use-cases/create-group.use-case';
import { GroupRepository } from './repositories/group.repository';
import { ChatGroup } from './entities/chat-group.entity';
import { ChatGroupMember } from './entities/chat-group-member.entity';
import { ConversationsModule } from '../conversations/conversation.module';
import { MessageModule } from '../messages/message.module';
import { UsersModule } from '../users/users.module';
import { IGroupRepositoryToken } from './repositories/group.repository.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatGroup, ChatGroupMember]),
    ConversationsModule, 
    MessageModule,
    UsersModule      
  ],
  controllers: [GroupController],
  providers: [
    CreateGroupUseCase,
    {
      provide: IGroupRepositoryToken,
      useClass: GroupRepository,
    },
  ],
})
export class GroupModule {}