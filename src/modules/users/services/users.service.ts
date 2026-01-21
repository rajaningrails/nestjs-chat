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
      `
    SELECT
      u.id,
      u.level,
      COALESCE(rh.logo, sd.image, st.image) AS image,
      COALESCE(sd.name, u.name) AS name
    FROM users u
    LEFT JOIN res_home rh
      ON u.level = 'client'
     AND rh.user_id = u.id
    LEFT JOIN student_detail sd
      ON u.level IN ('student', 'parent')
     AND sd.user_id = u.id
    LEFT JOIN staff st
      ON u.level NOT IN ('student', 'parent', 'client')
     AND st.user_id = u.id
    WHERE u.id = ?
    `,
      [id],
    );

    return user ?? null;
  }
}
