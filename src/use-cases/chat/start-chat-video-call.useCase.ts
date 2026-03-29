import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class StartChatVideoCallUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, user: any) {
    return this.chatService.startVideoCall(channelId, user);
  }
}
