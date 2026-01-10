import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { UserType } from './user-type.enum';

export class CreateUserDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;
  
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @IsNotEmpty()
  @IsString()
  name: string;
  
  @IsOptional()
  @IsString()
  image: string | null;

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
