import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IUserRepository } from './user.repository.interface';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findByUserId(user_id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { user_id } });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async update(user_id: number, userData: Partial<User>): Promise<User | null> {
    await this.userRepository.update(user_id, userData);
    return this.findByUserId(user_id);
  }
}