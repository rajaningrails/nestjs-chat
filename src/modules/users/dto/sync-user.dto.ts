import { IsEnum, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';
import { UserType } from './user-type.enum';

export class SyncUserDto {
  @IsNumberString()
  @IsNotEmpty()
  app_id: number;

  @IsNumberString()
  @IsNotEmpty()
  app_user_id: number;

  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  image: string;

  @IsEnum(UserType)
  @IsNotEmpty()
  type: UserType;

  @IsOptional()
  @IsString()
  class: string;

  @IsOptional()
  @IsString()
  section: string;
}
