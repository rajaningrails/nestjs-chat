import { IsIn, IsInt, IsNumber, IsNumberString, IsOptional } from 'class-validator';

export class DeleteMessageDto {
  @IsNumberString()
  messageId: number;

  @IsNumberString()
  conversationID: number;

  @IsNumberString()
  @IsOptional()
  receiverID: number;

  @IsNumberString()
  senderID: number;

  @IsNumberString()
  @IsOptional()
  groupID: number;
}
