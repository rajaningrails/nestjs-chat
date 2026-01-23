import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IUserRepository } from './user.repository.interface';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

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

  async update(userData: UpdateUserDto): Promise<User | null> {
    await this.userRepository.update({ user_id: userData.user_id }, userData);
    return this.findByUserId(userData.user_id);
  }

  async upsertUsers(users: Partial<CreateUserDto>[]): Promise<void> {
    if (!users.length) return;
  
    await this.userRepository
      .createQueryBuilder()
      .insert()
      .into(User)
      .values(users)
      .orUpdate(
        ['type','image', 'name','class', 'section'],   
        ['user_id'],             
      )
      .updateEntity(false)       
      .execute();
  }
  
  async findByUserIds(userIds: number[]): Promise<User[]> {
    return this.userRepository.find({
      where: {
        user_id: In(userIds),
      },
    });
  }
}
