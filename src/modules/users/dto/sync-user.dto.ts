import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserType } from './user-type.enum';

export class SyncUserDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  app_id: number;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  app_user_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  image?: string;

  @IsEnum(UserType)
  @IsNotEmpty()
  type: UserType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  class?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  section?: string;
}
