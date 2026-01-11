import { v4 as uuidv4 } from 'uuid';
import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { IMessageRepositoryToken } from '../repositories/message.repository.interface';
import { MessageService } from '../services/message.service';
import { ConversationService } from 'src/modules/conversations/services/conversation.service';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { MessageDto } from '../dto/message.dto';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';
import { profanity } from '@2toad/profanity';
import { IUserRepositoryToken } from 'src/modules/users/repositories/user.repository.interface';
import { IConversationRepositoryToken } from 'src/modules/conversations/repositories/conversation.repository.interface';

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(IConversationRepositoryToken)
    private readonly conversationRepository: ConversationRepository,
    @Inject(IUserRepositoryToken)
    private readonly userRepository: UserRepository,
    private readonly messagesService: MessageService,
    private readonly conversationService: ConversationService,
  ) {}

  async execute(request: MessageDto) {
    if(request.message && request.message.trim().length > 0) {      
      if (profanity.exists(request.message)) {
        throw new BadRequestException('Profanity not allowed');
      }
    }
    const existingConversation = await this.conversationRepository.findById(
      request.conversation_id,
    );
    if (!existingConversation) {
      throw new NotFoundException('Conversation does not exists');
    }
    const messageData: MessageDto = {
      id: uuidv4(),
      conversation_id: request.conversation_id,
      sender_id: request.sender_id,
      receiver_id: request.receiver_id,
      message: request.message,
      school_id: request.school_id,
      attachments: request.attachments,
      group_id: request.group_id,
    };
    await this.messagesService.createMessage(messageData);

    await this.conversationService.updateConversation({
      updated_at: new Date(),
      last_message_id: messageData.id,
      last_message_receiver_id: request.receiver_id,
      last_message_sender_id: request.sender_id,
    });

    const sender_user_details = await this.userRepository.findByUserId(
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
