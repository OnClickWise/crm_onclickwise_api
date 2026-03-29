import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class ReactChatMessageUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, messageId: string, data: { emoji: string }, user: any) {
    return this.chatService.reactToMessage(channelId, messageId, data.emoji, user);
  }
}
