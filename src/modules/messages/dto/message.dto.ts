import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsEnum,
  IsArray,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
}

export class MessageDto {
  @IsInt()
  sender_id: number;

  @ValidateIf(o => !o.group_id)
  @IsInt()
  receiver_id?: number;

  @ValidateIf(o => !o.receiver_id)
  @IsInt()
  group_id?: number;

  @IsUUID()
  conversation_id: number;

  @ValidateIf(o => o.message_type === MessageType.TEXT)
  @IsNotEmpty()
  @IsString()
  message?: string;

  @ValidateIf(o => o.message_type === MessageType.FILE)
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsEnum(MessageType)
  message_type: MessageType;
}
