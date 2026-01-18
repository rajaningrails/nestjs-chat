import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('veda-database', () => ({
  host: process.env.VEDA_DATABASE_HOST || 'localhost',
  port: process.env.VEDA_DATABASE_PORT || 3306,
  username: process.env.VEDA_DATABASE_USERNAME,
  password: process.env.VEDA_DATABASE_PASSWORD,
  database: process.env.VEDA_DATABASE_NAME,
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
}));