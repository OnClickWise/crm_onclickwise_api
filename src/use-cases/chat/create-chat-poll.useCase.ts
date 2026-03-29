import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class CreateChatPollUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(
    channelId: string,
    data: { question: string; options: string[]; allowMultiple?: boolean; endsAt?: string },
    user: any,
  ) {
    return this.chatService.createPoll(channelId, data, user);
  }
}
