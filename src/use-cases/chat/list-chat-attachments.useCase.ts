import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class ListChatAttachmentsUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, type?: 'attachment' | 'video' | 'audio', user?: any) {
    return this.chatService.listAttachments(channelId, type, user);
  }
}
