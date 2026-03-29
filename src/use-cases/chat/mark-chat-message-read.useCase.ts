import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class MarkChatMessageReadUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, data: { messageId: string }, user: any) {
    return this.chatService.markMessageRead(channelId, data.messageId, user);
  }
}
