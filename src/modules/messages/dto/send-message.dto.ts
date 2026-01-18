import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsOptional,
  ValidateIf,
  IsArray,
  IsNumber,
  IsDate,
} from 'class-validator';

export class SendMessageDto {
  @IsNumber()
  id: number;

  @IsInt()
  @IsNotEmpty()
  school_id: number;

  @IsInt()
  @IsNotEmpty()
  sender_id: number;

  @IsNumber()
  @IsNotEmpty()
  conversation_id: number;

  @IsInt()
  @IsOptional()
  receiver_id: number;

  @IsInt()
  @IsOptional()
  group_id: number;

  @ValidateIf((o) => !o.attachments || o.attachments.length === 0)
  @IsString()
  @IsNotEmpty()
  message?: string;

  @ValidateIf((o) => !o.message)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  attachments?: string[];

  @IsDate()
  @IsOptional()
  delivered_at?: Date;
}
