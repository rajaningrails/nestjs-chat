import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { IsAdmin, UserType } from './user-type.enum';

export class CreateUserDto {
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  image?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  class?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  section?: string;

  @IsEnum(UserType)
  @IsNotEmpty()
  type: UserType;

  @IsDateString()
  @IsOptional()
  created_at?: string;

  @IsDateString()
  @IsOptional()
  updated_at?: string;

  @IsEnum(IsAdmin)
  @IsOptional()
  is_admin?: IsAdmin;
}
