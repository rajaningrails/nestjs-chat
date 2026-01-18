import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import type { IUserRepository } from '../repositories/user.repository.interface';
import { IUserRepositoryToken } from '../repositories/user.repository.interface';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository) {}

  async execute(request: CreateUserDto): Promise<User> {

    const existingUser = await this.userRepository.findByUserId(request.user_id);
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    return this.userRepository.create(request);
  }
}