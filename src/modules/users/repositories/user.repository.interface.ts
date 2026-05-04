import { CreateUserDto } from "../dto/create-user.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { User } from "../entities/user.entity";

export const IUserRepositoryToken = Symbol('IUserRepository');
export interface IUserRepository {
  findAll(): Promise<User[]>;
  findByUserId(user_id:number): Promise<User | null>;
  create(userData: CreateUserDto): Promise<User>;
  update(userData: UpdateUserDto): Promise<User | null>;
}