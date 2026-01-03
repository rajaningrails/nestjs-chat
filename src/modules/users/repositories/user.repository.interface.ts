import { User } from "../entities/user.entity";

export const IUserRepositoryToken = Symbol('IUserRepository');
export interface IUserRepository {
  findAll(): Promise<User[]>;
  findByUserId(user_id:number): Promise<User | null>;
  create(userData: Partial<User>): Promise<User>;
  update(user_id: number, userData: Partial<User>): Promise<User | null>;
}