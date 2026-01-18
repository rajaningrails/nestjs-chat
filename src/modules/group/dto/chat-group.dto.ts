import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { UserType } from 'src/modules/users/dto/user-type.enum';

export class PartialCreateUserDto{
  @IsInt()
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
  @IsInt()
  @IsNotEmpty({ message: 'school_id is required' })
  school_id: number;

  @IsString()
  @IsNotEmpty({ message: 'group_name is required' })
  group_name: string;

  @IsString()
  @IsOptional()
  group_image: string;

  @IsNumber()
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