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
  group_id?: number | null;

  @IsEnum(ConversationType)
  @IsNotEmpty()
  type: ConversationType;

  @IsOptional()
  @IsEnum(GroupType)
  group_type?: GroupType;

  @IsOptional()
  @IsInt()
  last_message_id?: string;

  @IsOptional()
  @IsString()
  last_message?: string | null;

  @IsOptional()
  @IsInt()
  last_message_sender_id?: number;

  @IsOptional()
  @IsInt()
  last_message_receiver_id?: number | null;

  @IsOptional()
  @IsDateString()
  last_message_seen_at?: Date | null;
}
