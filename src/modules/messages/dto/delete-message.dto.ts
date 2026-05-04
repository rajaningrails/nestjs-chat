import { Type } from 'class-transformer';
import { IsInt, IsNumberString, IsOptional } from 'class-validator';

export class DeleteMessageDto {
  @IsNumberString()
  messageId: number;

  @IsNumberString()
  conversationID: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  receiverID?: number | null;

  @IsNumberString()
  senderID: number;
}
