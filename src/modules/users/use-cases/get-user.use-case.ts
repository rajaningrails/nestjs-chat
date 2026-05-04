import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UsersService } from '../services/users.service';

@Injectable()
export class GetUserUseCase {
  constructor(
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