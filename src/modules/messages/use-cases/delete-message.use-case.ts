import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { MessageService } from '../services/message.service';
import { DeleteMessageDto } from '../dto/delete-message.dto';
import { MessageGateway } from '../gateway/message.gateway';
import { UsersService } from 'src/modules/users/services/users.service';
import { MessageRepository } from '../repositories/message.repository';

@Injectable()
export class DeleteMessageUseCase {
  constructor(
    private readonly messageService: MessageService,
    private readonly messageGateway: MessageGateway,
    private readonly userService: UsersService,
    private readonly messageRepository: MessageRepository
  ) {}

  async execute(request: DeleteMessageDto) {
    const messageExists = await this.messageRepository.findById(request.messageId);
    if(!messageExists){
      throw new NotFoundException('Message doesnot exists');
    }
    await this.messageService.deleteMessage(request.messageId);
    const removerUserDetails = await this.userService.findUserById(request?.senderID);
    await this.messageGateway.emitMessageDeleted({
      messageId: request.messageId,
      receiverID: request.receiverID!,
      senderID: request?.senderID,
      conversationID: messageExists.conversation_id,
      message_remover_name: removerUserDetails?.name!,
      groupID: messageExists.group_id!
    })
    return {
      messageId: request.messageId,
      conversationId: request.conversationID,
      receiverId: request.receiverID,
      senderId: request?.senderID,
    };
  }
}
