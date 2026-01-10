import { IsInt, IsUUID } from 'class-validator';

export class SeenMessageDto {
  @IsUUID()
  messageId: string;

  @IsUUID()
  conversationID: string;

  @IsInt()
  receiverID: number;

  @IsInt()
  senderID: number;
}
