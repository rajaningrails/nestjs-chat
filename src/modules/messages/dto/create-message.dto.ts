import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsEnum,
  IsOptional,
  ValidateIf,
  IsArray,
  IsUUID,
  IsDate,
} from 'class-validator';
import { UserType } from 'src/modules/users/dto/user-type.enum';

export class CreateMessageDto {
  @IsUUID()
  id: string;

  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsInt()
  @IsNotEmpty()
  sender_id: number;
  
  @IsString()
  @IsNotEmpty()
  conversation_id: string

  @IsInt()
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
  @IsNotEmpty()
  sender_image: string;

  @IsString()
  @IsNotEmpty()
  receiver_image: string;


  @IsDate()
  @IsOptional()
  delivered_at?: Date
}
