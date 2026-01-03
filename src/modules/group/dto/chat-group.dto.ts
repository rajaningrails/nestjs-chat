import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateChatGroupDto {
  @IsOptional()
  @IsInt()
  school_id?: number;

  @IsString()
  @IsNotEmpty()
  group_name: string;

  @IsOptional()
  @IsString()
  group_image?: string;

  @IsInt()
  created_by: number;
}


export class UpdateChatGroupDto extends PartialType(CreateChatGroupDto) {}