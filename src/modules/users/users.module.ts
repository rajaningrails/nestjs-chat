import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserController } from './users.controller';
import { IUserRepositoryToken } from './repositories/user.repository.interface';
import { CreateUserUseCase } from './use-cases/create-user.use-case';
import { GetUserUseCase } from './use-cases/get-user.use-case';
import { UserRepository } from './repositories/user.repository';
import { UpdateUserUseCase } from './use-cases/update-user.use-case';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersService } from './services/users.service';
import { messageQueueConfig } from 'src/infrastructure/bullmq';
import { S3Module } from 'src/infrastructure/aws/aws.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ScheduleModule.forRoot(),
    messageQueueConfig,
    S3Module
  ],
  controllers: [UserController],
  providers: [
    {
      provide: IUserRepositoryToken,
      useClass: UserRepository,
    },
    CreateUserUseCase,
    GetUserUseCase,
    UpdateUserUseCase,
    UsersService,
    UserRepository,
  ],
  exports: [
    IUserRepositoryToken,
    CreateUserUseCase,
    UserRepository,
    UsersService,
  ],
})
export class UsersModule {}
