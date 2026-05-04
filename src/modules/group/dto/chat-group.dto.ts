import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsInt, IsNotEmpty, IsNumber, IsNumberString, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { UserType } from 'src/modules/users/dto/user-type.enum';

export class PartialCreateUserDto{
  @IsNumberString()
  @IsNotEmpty({ message: 'users id is required' })
  id: number;

  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  name: string;

  @IsEmail()
  @IsOptional()
  email: string;

  @IsString()
  @IsOptional()
  image: string;

  @IsString()
  @IsOptional()
  type: UserType;
}

export class CreateChatGroupDto {
  @IsNumberString()
  @IsNotEmpty({ message: 'school_id is required' })
  school_id: number;

  @IsString()
  @IsNotEmpty({ message: 'group_name is required' })
  group_name: string;

  @IsOptional()
  image?: any;

  @IsNumberString()
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
  @IsNumber()
  @IsNotEmpty({ message: 'group_id is required' })
  group_id: number;

  @IsInt()
  @IsNotEmpty({ message: 'school_id is required' })
  school_id: number;

  @IsString()
  @IsNotEmpty({ message: 'group_name is required' })
  group_name: string;

  @IsNumber()
  @IsNotEmpty({ message: 'created by is required' })
  created_by: number;

  @IsString()
  @IsOptional()
  group_image: string;

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
  @IsNumberString()
  @IsNotEmpty({ message: 'school id is required' })
  school_id: number;

  @IsNumberString()
  @IsNotEmpty({ message: 'user id is required' })
  user_id: number;
}