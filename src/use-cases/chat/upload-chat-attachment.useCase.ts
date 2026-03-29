import { Injectable } from '@nestjs/common';
import { ChatService } from '@/modules/chat/services/chat.service';

@Injectable()
export class UploadChatAttachmentUseCase {
  constructor(private readonly chatService: ChatService) {}

  async execute(channelId: string, file: any, user: any) {
    return this.chatService.uploadAttachment(channelId, file, user);
  }
}
