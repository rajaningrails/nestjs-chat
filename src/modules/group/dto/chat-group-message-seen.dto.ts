import { IsInt, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateGroupMessageSeenDto {
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @IsNumber()
  @IsNotEmpty()
  conversation_id: number;

  @IsNumber()
  @IsNotEmpty()
  message_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;
}
