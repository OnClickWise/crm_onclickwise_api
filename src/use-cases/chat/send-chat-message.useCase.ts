import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class SendChatMessageUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, data: { body: string }, user: any) {
    return this.chatService.sendMessage(channelId, data, user);
  }
}
