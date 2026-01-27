import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsOptional,
  ValidateIf,
  IsArray,
  IsNumber,
  IsDate,
  IsNumberString,
} from 'class-validator';

export class SendMessageDto {
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
  conversation_id: number;

  @IsOptional()
  @IsNumberString()
  receiver_id?: number;

  @IsOptional()
  @IsNumberString()
  group_id?: number;

  @ValidateIf((o) => !o.attachments || o.attachments.length === 0)
  @IsString()
  @IsNotEmpty()
  message?: string;

  @ValidateIf((o) => !o.message)
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  attachments?: string[];
}
