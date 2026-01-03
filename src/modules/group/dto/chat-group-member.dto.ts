import { IsInt, IsNotEmpty } from 'class-validator';

export class CreateChatGroupMemberDto {
  @IsInt()
  @IsNotEmpty()
  group_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;
}
