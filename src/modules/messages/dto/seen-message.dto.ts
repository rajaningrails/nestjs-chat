import { IsInt, IsNumber } from 'class-validator';

export class SeenMessageDto {
  @IsNumber()
  messageId: number;

  @IsNumber()
  conversationID: number;

  @IsInt()
  receiverID: number;

  @IsInt()
  senderID: number;
}
