import { IsIn, IsInt, IsNumber } from 'class-validator';

export class DeleteMessageDto {
  @IsNumber()
  messageId: number;

  @IsNumber()
  conversationID: number;

  @IsInt()
  receiverID: number;

  @IsInt()
  senderID: number;
}
