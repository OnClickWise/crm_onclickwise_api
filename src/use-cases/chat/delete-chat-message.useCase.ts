import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class DeleteChatMessageUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, messageId: string, user: any) {
    return this.chatService.deleteMessage(channelId, messageId, user);
  }
}
