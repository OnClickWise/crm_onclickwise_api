// src/modules/whatsapp/use-cases/get-conversations.usecase.ts
import { Injectable } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';

@Injectable()
export class GetConversationsUseCase {
  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(organizationId: string, query: { limit?: number; offset?: number }) {
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const conversations = await this.whatsappRepo.getConversationsByOrganization(
      organizationId, 
      limit, 
      offset
    );

    return conversations;
  }
}