import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateUserDto {
  @IsNumber()
  @IsNotEmpty()
  id: number;
  
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsString()
  @IsOptional()
  name: string;

  @IsString()
  @IsOptional()
  image: string;

  @IsInt()
  @IsNotEmpty()
  user_id: number;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  @IsString()
  section?: string;

}
