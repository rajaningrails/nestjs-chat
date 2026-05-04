import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
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
  name: string;

  @IsString()
  image: string;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  @IsString()
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
