import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';
import { UpdateChatMessageDto } from '@/modules/chat/dtos';

@Injectable()
export class UpdateChatMessageUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, messageId: string, data: UpdateChatMessageDto, user: any) {
    return this.chatService.updateMessage(channelId, messageId, data, user);
  }
}
