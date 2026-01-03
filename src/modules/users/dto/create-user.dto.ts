import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserType } from './user-type.enum';

export class CreateUserDto {
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsEnum(UserType)
  @IsNotEmpty()
  type: UserType;
}
