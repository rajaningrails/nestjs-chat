import {
  IsInt,
  IsNotEmpty,
  IsNumber,
} from 'class-validator';

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
}
