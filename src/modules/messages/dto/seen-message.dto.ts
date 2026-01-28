import { IsInt, IsNumber, IsNumberString, IsOptional } from 'class-validator';

export class SeenMessageDto {
  @IsNumberString()
  id: number;

  @IsNumberString()
  conversation_id: number;

  @IsNumberString()
  seen_update_sender_id: number;
  
  @IsNumberString()
  seen_update_receiver_id: number;
}
