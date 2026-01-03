import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserController } from './users.controller';
import { IUserRepositoryToken } from './repositories/user.repository.interface';
import { CreateUserUseCase } from './use-cases/create-user.use-case';
import { GetUserUseCase } from './use-cases/get-user.use-case';
import { GetUsersUseCase } from './use-cases/get-users.use-case';
import { UserRepository } from './repositories/user.repository';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [
    {
      provide: IUserRepositoryToken,
      useClass: UserRepository,
    },
    CreateUserUseCase,
    GetUserUseCase,
    GetUsersUseCase,
    UserRepository
  ],
  exports: [IUserRepositoryToken,CreateUserUseCase,UserRepository],
})

export class UsersModule { }