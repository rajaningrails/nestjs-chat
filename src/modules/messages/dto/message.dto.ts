import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsOptional,
  ValidateIf,
  IsArray,
  IsUUID,
} from 'class-validator';

export class MessageDto {
  @IsUUID()
  id: string;

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
  group_id?: string;

  @IsInt()
  conversation_id: string;

  @ValidateIf(o => !o.attachments || o.attachments.length === 0)
  @IsString()
  @IsNotEmpty()
  message?: string;

  @ValidateIf(o => !o.message)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  attachments?: string[];
}
