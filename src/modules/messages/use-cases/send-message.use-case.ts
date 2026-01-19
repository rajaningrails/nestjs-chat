import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { MessageDto } from '../dto/message.dto';
import { profanity } from '@2toad/profanity';
import { generateSafeNumericId } from 'src/utils/helpers';
import { UsersService } from 'src/modules/users/services/users.service';
import { ConversationService } from 'src/modules/conversations/services/conversation.service';

@Injectable()
export class SendMessageUseCase {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly userService: UsersService,
    private readonly messagesService: MessageService,
  ) {}

  async execute(request: MessageDto) {
    if (request.message && request.message.trim().length > 0) {
      if (profanity.exists(request.message)) {
        throw new BadRequestException('Profanity not allowed');
      }
    }
    const existingConversation = await this.conversationService.findById(
      request.conversation_id,
    );
    if (!existingConversation) {
      throw new NotFoundException('Conversation does not exists');
    }
    const messageData: MessageDto = {
      id: generateSafeNumericId(),
      conversation_id: request.conversation_id,
      sender_id: request.sender_id,
      receiver_id: request.receiver_id,
      message: request.message,
      school_id: request.school_id,
      attachments: request.attachments,
      group_id: request.group_id,
    };
    await this.messagesService.createMessage(messageData);

    const sender_user_details = await this.userService.findUserById(
      request.sender_id,
    );

    return {
      messageId: messageData.id,
      message_sent: messageData.message,
      attachments: messageData.attachments,
      conversation_id: messageData.conversation_id,
      seen_at: null,
      messageTime: new Date(),
      message_sender_id: request.sender_id,
      school_id: request.school_id,
      message_receiver_id: request.receiver_id,
      group_id: request.group_id,
      is_group: !!request.group_id,
      user_details: {
        id: sender_user_details?.user_id,
        name: sender_user_details?.name,
        image: sender_user_details?.image,
        level: sender_user_details?.type,
      },
    };
  }
}
