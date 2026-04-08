import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class SeenMessageDto {
  @Type(() => Number)
  @IsInt()
  id: number;

  @Type(() => Number)
  @IsInt()
  conversation_id: number;

  @Type(() => Number)
  @IsInt()
  seen_update_sender_id: number;

  @IsOptional()
  seen_update_receiver_id?: number;

  @IsOptional()
  group_id: number;
}
