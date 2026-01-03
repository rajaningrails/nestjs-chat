import {
  IsNotEmpty,
  IsNumberString,
  IsString,
} from 'class-validator';

export class ConversationDto {
  @IsNotEmpty()
  @IsNumberString()
  sender_id: number;

  @IsNotEmpty()
  @IsNumberString()
  receiver_id: number;

  @IsNotEmpty()
  @IsNumberString()
  group_id: number | null;

  @IsNotEmpty()
  @IsNumberString()
  message_id: number;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsNotEmpty()
  @IsString()
  message_date_time: Date;
  
}
