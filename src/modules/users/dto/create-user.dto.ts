import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { UserType } from './user-type.enum';

export class CreateUserDto {
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @IsEnum(UserType)
  @IsNotEmpty()
  type: UserType;

  @IsDateString()
  @IsOptional()
  created_at?: string;

  @IsDateString()
  @IsOptional()
  updated_at?: string;
}
