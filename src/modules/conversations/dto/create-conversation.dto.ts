import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ConversationType, GroupType } from './conversations.enum';

export class CreateConversationDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;
  
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsUUID()
  @IsOptional()
  group_id?: string;

  @IsEnum(ConversationType)
  @IsNotEmpty()
  type: ConversationType;

  @IsOptional()
  @IsEnum(GroupType)
  group_type?: GroupType;

  @IsOptional()
  @IsUUID()
  last_message_id?: string;

  @IsOptional()
  @IsString()
  last_message?: string;

  @IsOptional()
  @IsInt()
  last_message_sender_id?: number;

  @IsOptional()
  @IsInt()
  last_message_receiver_id?: number;

  @IsOptional()
  @IsDateString()
  last_message_seen_at?: Date;
}
