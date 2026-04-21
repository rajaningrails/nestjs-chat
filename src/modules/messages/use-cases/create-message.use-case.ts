import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { CreateMessageDto } from '../dto/create-message.dto';
import { ConversationRepository } from 'src/modules/conversations/repositories/conversation.repository';
import { ConversationType } from 'src/modules/conversations/dto/conversations.enum';
import { CreateUserDto } from 'src/modules/users/dto/create-user.dto';
import { profanity } from '@2toad/profanity';
import { IConversationRepositoryToken } from 'src/modules/conversations/repositories/conversation.repository.interface';
import { generateSafeNumericId } from 'src/utils/helpers';
import { UserRepository } from 'src/modules/users/repositories/user.repository';
import { MessageService } from '../services/message.service';
import { S3PresignedUrlService } from 'src/common/services/aws.service';

@Injectable()
export class CreateMessageUseCase {
  constructor(
    @Inject(IConversationRepositoryToken)
    private readonly conversationRepository: ConversationRepository,
    private readonly userRepository: UserRepository,
    private readonly messageService: MessageService,
    private readonly s3Service: S3PresignedUrlService,
  ) {}

  async execute(request: CreateMessageDto) {
    if (request.message!?.trim().length > 0) {
      if (profanity.exists(request.message!)) {
        throw new BadRequestException('Profanity not allowed');
      }
    }

    const [existingConversation] = await Promise.all([
      this.conversationRepository.checkIfConversationBetweenUserExists(
        request.sender_id,
        request.receiver_id,
      ),
      this.userRepository.upsertUsers([
        {
          school_id: request.school_id,
          type: request.sender_user_type,
          user_id: request.sender_id,
          image: request.sender_image,
          name: request.sender_name,
        },
        {
          school_id: request.school_id,
          type: request.receiver_user_type,
          user_id: request.receiver_id,
          image: request.receiver_image,
          name: request.receiver_name,
        },
      ] as CreateUserDto[]),
    ]);

    const conversation_id = existingConversation
      ? existingConversation.id
      : (
          await this.conversationRepository.save({
            school_id: request.school_id,
            type: ConversationType.USER,
            last_message_sender_id: request.sender_id,
            last_message_receiver_id: request.receiver_id,
          })
        ).id;

    const message_id = generateSafeNumericId();

    const [senderImage, receiverImage, attachments] = await Promise.all([
      request.sender_image
        ? this.s3Service.generatePresignedUrl(request.sender_image)
        : Promise.resolve(null),
      request.receiver_image
        ? this.s3Service.generatePresignedUrl(request.receiver_image)
        : Promise.resolve(null),
      request.attachments?.length
        ? this.s3Service.generatePresignedUrls(request.attachments)
        : Promise.resolve([]),
      this.messageService.createMessage({
        id: message_id,
        conversation_id,
        sender_id: request.sender_id,
        receiver_id: request.receiver_id,
        message: request.message,
        school_id: request.school_id,
      }),
    ]);

    return {
      id: message_id,
      message: request.message ?? '',
      attachments,
      conversation_id,
      seen_at: null,
      deleted_at: null,
      sender_id: request.sender_id,
      receiver_id: request.receiver_id,
      group_id: null,
      created_at: new Date(),
      updated_at: new Date(),
      receiver_image: receiverImage,
      user_details: {
        id: request.sender_id,
        name: request.sender_name,
        image: senderImage ?? '',
        level: request.sender_user_type,
      },
    };
  }
}