import { Injectable } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';

@Injectable()
export class MarkAsReadUseCase {
  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(conversationId: string, userId: string) {
    await this.whatsappRepo.markMessagesAsRead(conversationId, userId);
    
    return { success: true };
  }
}