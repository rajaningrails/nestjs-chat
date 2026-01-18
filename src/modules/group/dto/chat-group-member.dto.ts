import { IsInt, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateChatGroupMemberDto {
  @IsNumber()
  @IsNotEmpty()
  group_id: number;

  @IsInt()
  @IsNotEmpty()
  user_id: number;
}
