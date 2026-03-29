import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class ListChatChannelsUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(user: any) {
    return this.chatService.listChannels(user);
  }
}
