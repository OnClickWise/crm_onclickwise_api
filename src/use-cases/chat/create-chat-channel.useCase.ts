import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class CreateChatChannelUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(data: { name: string; description?: string; isPrivate?: boolean }, user: any) {
    return this.chatService.createChannel(data, user);
  }
}
