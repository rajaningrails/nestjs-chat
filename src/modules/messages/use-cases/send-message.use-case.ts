import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  ForbiddenException,
} from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { MessageDto } from '../dto/message.dto';
import { profanity } from '@2toad/profanity';
import { buildConfigMap, generateSafeNumericId } from 'src/utils/helpers';
import { UsersService } from 'src/modules/users/services/users.service';
import { ConversationService } from 'src/modules/conversations/services/conversation.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { MessageGateway } from '../gateway/message.gateway';
import { GroupRepository } from 'src/modules/group/repositories/group.repository';
import { S3PresignedUrlService } from 'src/common/services/aws.service';
import { ChatConfigRepository } from 'src/modules/chat_configs/repositories/chat-config.repository';
import { IChatConfigRepositoryToken } from 'src/modules/chat_configs/repositories/chat-config.repository.interface';
import { ConversationType } from 'src/modules/conversations/dto/conversations.enum';

@Injectable()
export class SendMessageUseCase {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly userService: UsersService,
    private readonly messageService: MessageService,
    private readonly messageGateway: MessageGateway,
    private readonly groupRepository: GroupRepository,
    private readonly s3Service: S3PresignedUrlService,
    @Inject(IChatConfigRepositoryToken)
    private readonly chatConfigRepository: ChatConfigRepository,
  ) {}

  async execute(request: Partial<SendMessageDto>) {
    this.validateRequest(request);

    const conversation = await this.getConversation(request.conversation_id!);

    await this.assertSendPermission(request.message_sender_id!, conversation);

    const isGroup = !!conversation.group_id;
    const messageData = this.buildMessageData(request, conversation, isGroup);

    await this.messageService.createMessage(messageData);

    const { sender, receiver, group } = await this.fetchRelatedEntities(
      request,
      conversation,
    );

    const [senderImage, receiverImage, groupImage, attachments] =
      await Promise.all([
        sender?.image
          ? this.s3Service.generatePresignedUrl(sender.image)
          : Promise.resolve(null),
        receiver?.image
          ? this.s3Service.generatePresignedUrl(receiver.image)
          : Promise.resolve(null),
        group?.group_image
          ? this.s3Service.generatePresignedUrl(group.group_image)
          : Promise.resolve(null),
        messageData?.attachments?.length
          ? this.s3Service.generatePresignedUrls(messageData.attachments)
          : Promise.resolve([]),
      ]);

    const presignedSender = sender ? { ...sender, image: senderImage } : sender;
    const presignedReceiver = receiver
      ? { ...receiver, image: receiverImage }
      : receiver;
    const presignedGroup = group
      ? { ...group, group_image: groupImage }
      : group;
    const presignedMessageData = { ...messageData, attachments };

    this.emitMessageEvent(
      presignedMessageData,
      presignedSender,
      presignedReceiver,
      presignedGroup,
      conversation,
    );

    return this.buildResponse(presignedMessageData, presignedSender, request);
  }
  private async assertSendPermission(
    senderId: number,
    conversation: any,
  ): Promise<void> {
    const chatConfigs = await this.chatConfigRepository.findBy(
      String(senderId),
    );

    const configMap = buildConfigMap(chatConfigs);

    const allowed = await this.isConversationAllowed(conversation, configMap);
    if (!allowed) {
      throw new ForbiddenException(
        'You are not allowed to send messages in this conversation',
      );
    }
  }
  
  private async isConversationAllowed(
    conversation: any,
    configMap: Map<string, number>,
  ): Promise<boolean> {
    if (conversation.type === ConversationType.USER) {
      const [sender, receiver] = await Promise.all([
        this.userService.findUserById(conversation.last_message_sender_id),
        this.userService.findUserById(conversation.last_message_receiver_id),
      ]);

      const senderType = sender?.type;
      const receiverType = receiver?.type;

      if (senderType === 'staff' && receiverType === 'staff') {
        return configMap.get('teacher_to_teacher_chat') === 1;
      }
      if (
        (senderType === 'staff' && receiverType === 'student') ||
        (senderType === 'student' && receiverType === 'staff')
      ) {
        return configMap.get('teacher_to_student_chat') === 1;
      }
      return false;
    }

    if (conversation.type === ConversationType.GROUP) {
      const groupType = conversation.group?.group_type;
      if (groupType === 'student_group') {
        return configMap.get('student_group_chat') === 1;
      }
      if (groupType === 'teacher_group') {
        return configMap.get('teacher_group_chat') === 1;
      }
      return false;
    }

    return false;
  }

  private validateRequest(request: Partial<SendMessageDto>) {
    if (!request.conversation_id || !request.message_sender_id) {
      throw new BadRequestException('Missing required fields');
    }

    const messageText = request.message?.trim();

    if (messageText && profanity.exists(messageText)) {
      throw new BadRequestException('Profanity not allowed');
    }
  }

  private async getConversation(conversationId: number) {
    const conversation =
      await this.conversationService.findById(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation does not exist');
    }

    return conversation;
  }

  private buildMessageData(
    request: Partial<SendMessageDto>,
    conversation: any,
    isGroup: boolean,
  ): MessageDto {
    return {
      id: generateSafeNumericId(),
      conversation_id: request.conversation_id!,
      sender_id: request.message_sender_id!,
      message: request.message?.trim(),
      school_id: request.school_id!,
      attachments: request.attachments,
      group_id: conversation.group_id,
      ...(isGroup ? {} : { receiver_id: request.message_receiver_id }),
    };
  }

  private async fetchRelatedEntities(
    request: Partial<SendMessageDto>,
    conversation: any,
  ) {
    const senderPromise = this.userService.findUserById(
      request.message_sender_id!,
    );

    const receiverPromise = request.message_receiver_id
      ? this.userService.findUserById(request.message_receiver_id)
      : Promise.resolve(null);

    const groupPromise = conversation.group_id
      ? this.groupRepository.findById(conversation.group_id)
      : Promise.resolve(null);

    const [sender, receiver, group] = await Promise.all([
      senderPromise,
      receiverPromise,
      groupPromise,
    ]);

    return { sender, receiver, group };
  }

  private emitMessageEvent(
    messageData: MessageDto,
    sender: any,
    receiver: any,
    group: any,
    conversation: any,
  ) {
    this.messageGateway.emitNewMessage(
      messageData,
      sender,
      receiver,
      conversation,
      group,
    );
  }

  private buildResponse(
    messageData: MessageDto,
    sender: any,
    request: Partial<SendMessageDto>,
  ) {
    return {
      messageId: messageData.id,
      message_sent: messageData.message,
      attachments: messageData.attachments,
      conversation_id: messageData.conversation_id,
      seen_at: null,
      messageTime: new Date(),
      message_sender_id: request.message_sender_id,
      school_id: request.school_id,
      message_receiver_id: request.message_receiver_id,
      group_id: request.group_id,
      is_group: !!request.group_id,
      user_details: {
        id: sender?.user_id,
        name: sender?.name,
        image: sender?.image,
        level: sender?.type,
      },
    };
  }
}
