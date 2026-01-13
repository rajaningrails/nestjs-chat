import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';
import { UserType } from './user-type.enum';

export class UpdateUserDto {
  @IsNumber()
  @IsNotEmpty()
  id: number;
  
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
  image: string;

  @IsEnum(UserType)
  @IsNotEmpty()
  type: UserType;
}
