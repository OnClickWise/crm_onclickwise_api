// src/modules/whatsapp/use-cases/get-messages.usecase.ts
import { Injectable, ForbiddenException } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';

@Injectable()
export class GetMessagesUseCase {
  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(organizationId: string, conversationId: string, query: { limit?: number; offset?: number }) {
    // 1. Verificar se a conversa pertence à organização (Segurança Multi-tenant)
    // Opcional: Criar um método no repo 'getConversationById'
    
    const messages = await this.whatsappRepo.getMessagesByConversation(
      conversationId,
      query.limit || 50,
      query.offset || 0
    );

    return messages;
  }
}