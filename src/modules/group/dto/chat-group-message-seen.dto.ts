import { IsInt, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateGroupMessageSeenDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsUUID()
  @IsNotEmpty()
  conversation_id: string;

  @IsUUID()
  @IsNotEmpty()
  message_id: string;

  @IsInt()
  @IsNotEmpty()
  user_id: number;
}
