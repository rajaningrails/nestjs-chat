import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { CreateMessageDto } from '../dto/create-message.dto';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';
import { ConversationType } from 'src/modules/conversations/dto/conversations.enum';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';
import { profanity } from '@2toad/profanity';
import { IConversationRepositoryToken } from 'src/modules/conversations/repositories/conversation.repository.interface';
import { generateSafeNumericId } from 'src/utils/helpers';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { MessageRepository } from '../repositories/message.repository';

@Injectable()
export class CreateMessageUseCase {
  constructor(
    @Inject(IConversationRepositoryToken)
    private readonly conversationRepository: ConversationRepository,
    private readonly userRepository: UserRepository,
    private readonly messageRepository: MessageRepository,
  ) {}

  async execute(request: CreateMessageDto) {
    if (request.message && request.message.trim().length > 0) {
      if (profanity.exists(request.message)) {
        throw new BadRequestException('Profanity not allowed');
      }
    }
    let conversation_id: number | null = generateSafeNumericId();
    let message_id: number | null = generateSafeNumericId();
    const existingConversation =
      await this.conversationRepository.checkIfConversationBetweenUserExists(
        request.sender_id,
        request.receiver_id,
      );

    if (existingConversation) {
      conversation_id = existingConversation.id;
    } else {
      await this.conversationRepository.save({
        school_id: request.school_id,
        type: ConversationType.USER,
        last_message_sender_id: request.sender_id,
        last_message_receiver_id: request.receiver_id,
        last_message_id: message_id,
      });
    }
    await this.messageRepository.save({
      id: message_id,
      conversation_id: conversation_id,
      sender_id: request.sender_id,
      receiver_id: request.receiver_id,
      message: request.message,
      school_id: request.school_id,
    });
    const payloadUsers: CreateUserDto[] = [
      {
        school_id: request.school_id,
        type: request.sender_user_type,
        user_id: request.sender_id,
      },
      {
        school_id: request.school_id,
        type: request.receiver_user_type,
        user_id: request.receiver_id,
      },
    ];
    await this.userRepository.upsertUsers(payloadUsers);

    return {
      id: message_id,
      message: request.message ?? '',
      attachments: request.attachments ?? [],
      conversation_id: conversation_id,
      seen_at: null,
      deleted_at: null,
      sender_id: request.sender_id,
      receiver_id: request.receiver_id,
      group_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      receiver_image: request.receiver_image,
      user_details: {
        id: request.sender_id,
        name: request.sender_name,
        image: request.sender_image,
        level: request.sender_user_type,
      },
    };
  }
}
