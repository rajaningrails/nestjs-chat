import { IsInt, IsNotEmpty } from 'class-validator';

export class CreateGroupMessageSeenDto {
  @IsInt()
  @IsNotEmpty()
  conversation_id: number;

  @IsInt()
  @IsNotEmpty()
  message_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;
}
