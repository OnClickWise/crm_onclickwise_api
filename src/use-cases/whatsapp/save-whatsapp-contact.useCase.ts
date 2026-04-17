import { Injectable } from '@nestjs/common'; // 1. Importe o Injectable
import { WhatsappRepository } from "@/modules/whatsapp/repositories/whatsapp.repository";

interface SaveContactRequest {
  organization_id: string;
  wa_id: string;
  display_name: string;
}

@Injectable() // 2. Adicione o decorator aqui
export class SaveWhatsappContactUseCase {
  constructor(private readonly whatsappRepository: WhatsappRepository) {}

  async execute(request: SaveContactRequest) {
    if (!request.display_name || request.display_name.trim() === '') {
      throw new Error('O nome do contato é obrigatório');
    }

    return await this.whatsappRepository.upsertEvolutionContact(request);
  }
}