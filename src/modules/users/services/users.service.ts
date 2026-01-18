import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource('veda-database')
    private readonly readOnlyDb: DataSource,
  ) {}

  async findUserById(id: number): Promise<any> {
    const query = `
      SELECT * FROM "user" WHERE id = $1
    `;
    const result = await this.readOnlyDb.query(query, [id]);
    return result[0] || null;
  }
}
