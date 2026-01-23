import { Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository
  ) {}

  async findUserById(id: number): Promise<User|null> {
    return this.userRepository.findByUserId(id);
  }

  async upsertUserBatch(users: Partial<CreateUserDto>[]) {
    await this.userRepository.upsertUsers(users);
  }
}
