import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsEnum,
  IsOptional,
  ValidateIf,
  IsArray,
  IsNumber,
  IsDate,
  IsNumberString,
} from 'class-validator';
import { UserType } from 'src/modules/users/dto/user-type.enum';

export class CreateMessageDto {
  @IsNumber()
  @IsOptional()
  id: number;

  @IsNumberString()
  @IsNotEmpty()
  school_id: number;

  @IsNumberString()
  @IsNotEmpty()
  sender_id: number;

  @IsNumberString()
  @IsNotEmpty()
  receiver_id: number;

  @ValidateIf(o => !o.attachments || o.attachments.length === 0)
  @IsString()
  @IsNotEmpty()
  message?: string;

  @ValidateIf(o => !o.message)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  attachments?: string[];

  @IsEnum(UserType)
  sender_user_type: UserType;

  @IsEnum(UserType)
  receiver_user_type: UserType;

  @IsString()
  @IsNotEmpty()
  sender_name: string;

  @IsString()
  @IsNotEmpty()
  receiver_name: string;

  @IsString()
  @IsOptional()
  sender_image: string;

  @IsString()
  @IsOptional()
  receiver_image: string;

  @IsString()
  @IsOptional()
  receiver_class: string;

  @IsString()
  @IsOptional()
  receiver_section: string;
}
