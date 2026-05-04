import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateChatConfigDto {
  @IsInt()
  @IsOptional()
  id: number;

  @IsNumberString()
  @IsNotEmpty()
  school_id: number;

  @IsNumberString()
  @IsNotEmpty()
  user_id: number;

  @IsString()
  feature_key: string;

  @IsNumberString()
  value: number;

  @IsDateString()
  @IsOptional()
  created_at?: string;

  @IsDateString()
  @IsOptional()
  updated_at?: string;
}
