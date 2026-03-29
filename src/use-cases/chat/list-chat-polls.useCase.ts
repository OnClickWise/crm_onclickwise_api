import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class ListChatPollsUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, user: any) {
    return this.chatService.listPolls(channelId, user);
  }
}
