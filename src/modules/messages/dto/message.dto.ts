import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsEnum,
  IsOptional,
  ValidateIf,
} from 'class-validator';

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
}

export class MessageDto {
  @IsInt()
  school_id: number;

  @IsInt()
  sender_id: number;

  @ValidateIf(o => !o.group_id)
  @IsInt()
  @IsOptional()
  receiver_id?: number;

  @ValidateIf(o => !o.receiver_id)
  @IsInt()
  @IsOptional()
  group_id?: number;

  @IsInt()
  conversation_id: number;

  @IsOptional()
  @IsInt()
  chat_reply_id?: number;

  @ValidateIf(o => o.message_type === MessageType.TEXT)
  @IsNotEmpty()
  @IsString()
  message?: string;

  @ValidateIf(o => o.message_type === MessageType.FILE)
  @IsNotEmpty()
  @IsString()
  attachments?: string;

  @IsEnum(MessageType)
  message_type: MessageType;
}
