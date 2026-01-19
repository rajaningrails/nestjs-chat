import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      name: 'veda-database',
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('veda-database.host'),
        port: config.get<number>('veda-database.port'),
        username: config.get('veda-database.username'),
        password: config.get('veda-database.password'),
        database: config.get('veda-database.database'),

        synchronize: false,
        logging: false,
        entities: [], // ✅ no entities = no schema sync
      }),
    }),
  ],
  exports: [TypeOrmModule], // 🔥 THIS WAS REQUIRED
})
export class VedaDatabaseModule {}
