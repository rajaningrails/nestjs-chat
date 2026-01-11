import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { IUserRepository } from './user.repository.interface';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { escapeValue } from 'src/utils/helpers';

@Injectable()
export class UserRepository implements IUserRepository {
  private readonly CHUNK_SIZE = 100;

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

  async update(user_id: number, userData: UpdateUserDto): Promise<User | null> {
    await this.userRepository.update(user_id, userData);
    return this.findByUserId(user_id);
  }

  async findByUserIds(userIds: number[]): Promise<User[]> {
    return this.userRepository.find({
      where: {
        user_id: In(userIds),
      },
    });
  }

  async bulkCreate(users: CreateUserDto[]): Promise<void> {
    const entities = this.userRepository.create(users);
    await this.userRepository.save(entities);
  }

  async upsertBatch(users: Partial<User>[]): Promise<void> {
    if (!users.length) return;

    for (let i = 0; i < users.length; i += this.CHUNK_SIZE) {
      const chunk = users.slice(i, i + this.CHUNK_SIZE);

      await this.userRepository
        .createQueryBuilder()
        .insert()
        .into(User)
        .values(chunk)
        .orUpdate(['name', 'email', 'image', 'type'], ['user_id'])
        .execute();
    }
  }
}
