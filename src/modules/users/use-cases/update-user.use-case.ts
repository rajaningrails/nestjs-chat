import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { User } from '../entities/user.entity';
import type { IUserRepository } from '../repositories/user.repository.interface';
import { IUserRepositoryToken } from '../repositories/user.repository.interface';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserService } from '../services/user.service';

@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    private readonly userService: UserService) {}

  async execute(request: UpdateUserDto): Promise<User | null> {

    const existingUser = await this.userRepository.findByUserId(request.user_id!);
    if (!existingUser) {
      throw new ConflictException('User does not exists');
    }

    return this.userService.updateUser(request);
  }
}