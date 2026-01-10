import { IsIn, IsInt, IsUUID } from 'class-validator';

export class DeleteMessageDto {
  @IsUUID()
  messageId: string;

  @IsUUID()
  conversationID: string;

  @IsInt()
  receiverID: number;

  @IsInt()
  senderID: number;
}
