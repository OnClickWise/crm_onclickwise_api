// src/modules/whatsapp/use-cases/get-conversations.usecase.ts
import { Injectable, Logger } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';

@Injectable()
export class GetConversationsUseCase {
  private readonly logger = new Logger(GetConversationsUseCase.name);

  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(organizationId: string, query: { limit?: number; offset?: number }) {
    if (!organizationId) {
      this.logger.error('organizationId is missing!');
      return [];
    }

    const limit = Number(query.limit) || 50;
    const offset = Number(query.offset) || 0;

    // Buscamos as conversas já formatadas do repositório
    const conversations = await this.whatsappRepo.getConversationsByOrganization(
      organizationId, 
      limit, 
      offset
    );

    return conversations;
  }
}