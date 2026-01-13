import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { ConversationType, GroupType } from './conversations.enum';

export class CreateConversationDto {
  @IsNumber()
  @IsNotEmpty()
  id: number;
  
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsNumber()
  @IsOptional()
  group_id?: number;

  @IsEnum(ConversationType)
  @IsNotEmpty()
  type: ConversationType;

  @IsOptional()
  @IsEnum(GroupType)
  group_type?: GroupType;

  @IsOptional()
  @IsNumber()
  last_message_id?: number;

  @IsOptional()
  @IsNumber()
  last_message_sender_id?: number;

  @IsOptional()
  @IsNumber()
  last_message_receiver_id?: number;

  @IsDateString()
  @IsOptional()
  created_at?: Date;

  @IsDateString()
  @IsOptional()
  updated_at?: Date;
}
