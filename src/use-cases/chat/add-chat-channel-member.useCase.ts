import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class AddChatChannelMemberUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, data: { userId: string; role?: 'member' | 'moderator' }, user: any) {
    return this.chatService.addChannelMember(channelId, data, user);
  }
}
