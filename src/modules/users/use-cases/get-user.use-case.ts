import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import type { IUserRepository } from '../repositories/user.repository.interface';
import { IUserRepositoryToken } from '../repositories/user.repository.interface';
import { User } from '../entities/user.entity';
import { UsersService } from '../services/users.service';

@Injectable()
export class GetUserUseCase {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    private readonly userService: UsersService
  ) {}

  async execute(userId: number): Promise<User> {
    const user = await this.userService.findUserById(userId!);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}