import { IsNumberString, ValidateIf, IsOptional } from 'class-validator';

export class DeleteConversationDto {
  
  @ValidateIf((o) => !o.groupID)
  @IsNumberString()
  receiverID?: number;

  @IsOptional()
  @IsNumberString()
  senderID?: number;

  @IsOptional()
  @IsNumberString()
  conversationID?: number;

  @IsOptional()
  @IsNumberString()
  groupID?: number;
}