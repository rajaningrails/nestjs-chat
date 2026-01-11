import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserController } from './users.controller';
import { IUserRepositoryToken } from './repositories/user.repository.interface';
import { CreateUserUseCase } from './use-cases/create-user.use-case';
import { GetUserUseCase } from './use-cases/get-user.use-case';
import { UserRepository } from './repositories/user.repository';
import { UpdateUserUseCase } from './use-cases/update-user.use-case';
import { userQueueConfig } from 'src/infrastructure/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { UserService } from './services/user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), userQueueConfig, ScheduleModule.forRoot()],
  controllers: [UserController],
  providers: [
    {
      provide: IUserRepositoryToken,
      useClass: UserRepository,
    },
    CreateUserUseCase,
    GetUserUseCase,
    UserService,
    UpdateUserUseCase,
    UserRepository
  ],
  exports: [IUserRepositoryToken, CreateUserUseCase, UserRepository,UserService],
})

export class UsersModule { }