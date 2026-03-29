import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class ListChatMessagesUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, user: any, limit?: number, before?: string) {
    return this.chatService.listMessages(channelId, user, limit, before);
  }
}
