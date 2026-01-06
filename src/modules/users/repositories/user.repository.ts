import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { IUserRepository } from './user.repository.interface';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';

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

  async create(userData: CreateUserDto): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async update(user_id: number, userData: Partial<User>): Promise<User | null> {
    await this.userRepository.update(user_id, userData);
    return this.findByUserId(user_id);
  }

  async upsertUser(
    userData: Partial<User>,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const existing = await repo.findOne({
      where: {
        user_id: userData.user_id,
      },
    });
    if (existing) {
      return;
    }
    await repo.upsert(userData, ['user_id', 'school_id']);
  }

  async findByUserIds(userIds: number[]): Promise<User[]> {
    return this.userRepository.find({
      where:{
        user_id: In(userIds)
      }
    });
  }

  async bulkCreate(users: CreateUserDto[]):Promise<void> {
    const entities = this.userRepository.create(users);
    await this.userRepository.save(entities);
  }
}
