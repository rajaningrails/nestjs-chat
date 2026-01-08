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

  async upsertUser(
    userData: CreateUserDto,
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
      where: {
        user_id: In(userIds),
      },
    });
  }

  async bulkCreate(users: CreateUserDto[]): Promise<void> {
    const entities = this.userRepository.create(users);
    await this.userRepository.save(entities);
  }

  async createBatch(users: CreateUserDto[]): Promise<void> {
    for (let i = 0; i < users.length; i += this.CHUNK_SIZE) {
      const chunk = users.slice(i, i + this.CHUNK_SIZE);
      await this.userRepository
        .createQueryBuilder()
        .insert()
        .into(User)
        .values(chunk)
        .orIgnore()
        .execute();
    }
  }

  async updateBatch(users: Partial<User>[]): Promise<void> {
    if (!users.length) return;

    const fields = ['name', 'email', 'image', 'type'];

    const setObject: any = {};

    for (const field of fields) {
      const cases = users
        .filter(u => u[field] !== undefined)
        .map(u => `WHEN ${u.user_id} THEN ${escapeValue(u[field])}`)
        .join(' ');

      if (cases.length) {
        setObject[field] = () =>
          `CASE user_id ${cases} ELSE ${field} END`;
      }
    }

    const ids = users.map(u => u.user_id);

    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set(setObject)
      .where('user_id IN (:...ids)', { ids })
      .execute();
  }
}
