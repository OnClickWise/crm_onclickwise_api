import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class VoteChatPollUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, pollId: string, data: { optionId: string }, user: any) {
    return this.chatService.votePoll(channelId, pollId, data.optionId, user);
  }
}
