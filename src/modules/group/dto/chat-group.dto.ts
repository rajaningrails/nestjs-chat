import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { UserType } from 'src/modules/users/dto/user-type.enum';

export class PartialCreateUserDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'users id is required' })
  id: number;

  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  image?: string;

  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;
}

export class CreateChatGroupDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'school_id is required' })
  school_id: number;

  @IsString()
  @IsNotEmpty({ message: 'group_name is required' })
  @MaxLength(255)
  group_name: string;

  @IsOptional()
  image?: any;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'created by is required' })
  created_by: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialCreateUserDto)
  @IsOptional()
  studentDetails?: PartialCreateUserDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialCreateUserDto)
  @IsOptional()
  staffDetails?: PartialCreateUserDto[];
}

export class UpdateGroupDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'group_id is required' })
  group_id: number;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'school_id is required' })
  school_id: number;

  @IsString()
  @IsNotEmpty({ message: 'group_name is required' })
  @MaxLength(255)
  group_name: string;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'created by is required' })
  created_by: number;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  group_image?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialCreateUserDto)
  @IsOptional()
  studentDetails?: PartialCreateUserDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartialCreateUserDto)
  @IsOptional()
  staffDetails?: PartialCreateUserDto[];
}

export class GetGroupDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  group_id: number;
}

export class GetGroupNameDto {
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'school id is required' })
  school_id: number;

  @Type(() => Number)
  @IsInt()
  @IsNotEmpty({ message: 'user id is required' })
  user_id: number;
}