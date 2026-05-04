import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CreateUserUseCase } from './use-cases/create-user.use-case';
import { GetUserUseCase } from './use-cases/get-user.use-case';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserUseCase } from './use-cases/update-user.use-case';
import { User } from './entities/user.entity';
import { SyncUserDto } from './dto/sync-user.dto';

@Controller()
export class UserController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly getUserUseCase: GetUserUseCase,
  ) {}

  @Post('users/create')
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    const user = await this.createUserUseCase.execute(createUserDto);
    return user;
  }

  @Post('sync-user')
  async syncUser(@Body() updateUserDto: SyncUserDto): Promise<User> {
    const user = await this.updateUserUseCase.execute(updateUserDto);
    return user!;
  }

  @Get('users/:id')
  async findOne(@Param('id') id: number): Promise<User> {
    const user = await this.getUserUseCase.execute(id);
    return user;
  }

}