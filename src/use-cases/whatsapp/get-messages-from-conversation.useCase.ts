// src/modules/whatsapp/use-cases/get-messages.usecase.ts
import { Injectable } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';

@Injectable()
export class GetMessagesUseCase {
  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(organizationId: string, conversationId: string, query: { limit?: number; offset?: number }) {
    // Agora passamos o organizationId como trava de segurança
    const messages = await this.whatsappRepo.getMessagesByConversation(
      conversationId,
      organizationId, // Adicionado aqui
      query.limit || 50,
      query.offset || 0
    );

    return messages;
  }
}