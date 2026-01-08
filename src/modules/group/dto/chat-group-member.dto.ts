import { IsInt, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateChatGroupMemberDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsUUID()
  @IsNotEmpty()
  group_id: string;

  @IsInt()
  @IsNotEmpty()
  user_id: number;
}
