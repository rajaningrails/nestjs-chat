import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { ConversationType, GroupType } from './conversations.enum';

export class CreateConversationDto {
  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsOptional()
  @IsInt()
  group_id?: number;

  @IsEnum(ConversationType)
  @IsNotEmpty()
  type: ConversationType;

  @IsOptional()
  @IsEnum(GroupType)
  group_type?: GroupType;

  @IsOptional()
  @IsInt()
  last_message_id?: number;

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
  last_message_seen_at?: Date | null;
}
