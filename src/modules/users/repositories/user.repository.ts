import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IUserRepository } from './user.repository.interface';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { S3PresignedUrlService } from 'src/common/services/aws.service';
import { handleUserType, IsAdminHelper } from 'src/utils/helpers';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly s3Service: S3PresignedUrlService
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findByUserId(user_id: number): Promise<User | null> {
    const response = await this.userRepository.findOne({ where: { user_id } });
    const userImage = await this.s3Service.generatePresignedUrl(
      response?.image!,
    );
    return { ...response, image: userImage } as User;
  }

  async create(userData: CreateUserDto): Promise<User> {
    const user = this.userRepository.create({...userData, type: handleUserType(userData.type), is_admin: IsAdminHelper(userData.type)});
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
