import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserController } from './users.controller';
import { IUserRepositoryToken } from './repositories/user.repository.interface';
import { CreateUserUseCase } from './use-cases/create-user.use-case';
import { GetUserUseCase } from './use-cases/get-user.use-case';
import { UserRepository } from './repositories/user.repository';
import { UpdateUserUseCase } from './use-cases/update-user.use-case';

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
    UpdateUserUseCase,
    UserRepository
  ],
  exports: [IUserRepositoryToken,CreateUserUseCase,UserRepository],
})

export class UsersModule { }