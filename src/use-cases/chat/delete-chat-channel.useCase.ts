import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class DeleteChatChannelUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, user: any) {
    return this.chatService.deleteChannel(channelId, user);
  }
}
