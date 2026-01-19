import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource('veda-database')
    private readonly vedaDb: DataSource,
  ) {}

  async findUserById(id: number) {
    const [user] = await this.vedaDb.query(
      'SELECT * FROM user WHERE id = ?',
      [id],
    );
    return user ?? null;
  }
}
