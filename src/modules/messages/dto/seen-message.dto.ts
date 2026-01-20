import { IsInt, IsNumber, IsOptional } from 'class-validator';

export class SeenMessageDto {
  @IsNumber()
  messageId: number;

  @IsNumber()
  conversationID: number;

  @IsInt()
  @IsOptional()
  receiverID?: number;

  @IsInt()
  senderID: number;

  @IsInt()
  @IsOptional()
  groupID?: number;
}
