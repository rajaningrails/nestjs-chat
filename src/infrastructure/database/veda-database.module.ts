import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        name: 'veda-database',
        host: configService.get<string>('veda-database.host'),
        port: configService.get<number>('veda-database.port') || 3306,
        username: configService.get<string>('veda-database.username'),
        password: configService.get<string>('veda-database.password'),
        database: configService.get<string>('veda-database.database'),
        synchronize: configService.get<boolean>('veda-database.synchronize'),
        entities:[],
        logging: configService.get<boolean>('veda-database.logging'),
        extra: {
          options: '-c default_transaction_read_only=on',
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
