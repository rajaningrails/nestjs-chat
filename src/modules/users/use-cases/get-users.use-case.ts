import { Injectable, Inject } from '@nestjs/common';
import type { IUserRepository } from '../repositories/user.repository.interface';
import { IUserRepositoryToken } from '../repositories/user.repository.interface';
import { User } from '../entities/user.entity';

@Injectable()
export class GetUsersUseCase {
  constructor(
    @Inject(IUserRepositoryToken) 
    private readonly userRepository: IUserRepository
  ) {}

  async execute(): Promise<User[]> {
    return this.userRepository.findAll();
  }
}