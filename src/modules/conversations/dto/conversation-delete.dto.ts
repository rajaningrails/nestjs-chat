import {
    IsNumberString,
} from 'class-validator';

export class DeleteConversationDto {
    @IsNumberString()
    receiverID: number;

    @IsNumberString()
    senderID?: number;

    @IsNumberString()
    conversationID?: number;

    @IsNumberString()
    groupID?: number;

}