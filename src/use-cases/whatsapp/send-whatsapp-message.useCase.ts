// src/modules/whatsapp/use-cases/send-whatsapp-message.usecase.ts

import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';
import { SendWhatsappMessageDto } from '@/modules/whatsapp/dtos/send-message-dto';
import axios from 'axios';

@Injectable()
export class SendWhatsappMessageUseCase {
  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(organizationId: string, dto: SendWhatsappMessageDto) {
    const account = await this.whatsappRepo.getEvolutionAccountByOrganizationId(organizationId);
    if (!account) throw new NotFoundException('Conta não configurada.');

    const apiUrl = String(process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
    const apiKey = String(process.env.EVOLUTION_API_KEY || '').trim();
    const formattedTo = dto.to.replace(/\D/g, ''); 

    try {
      // 4. Disparo para a Evolution API
      const { data: evoRes } = await axios.post(
        `${apiUrl}/message/sendText/${account.instance_name}`,
        { number: formattedTo, text: dto.text, delay: 1200, linkPreview: true },
        { headers: { 'apikey': apiKey, 'Content-Type': 'application/json' } }
      );

      // --- O PULO DO GATO ESTÁ AQUI ---
      
      // 5.1 Garante que o CONTATO seja encontrado ou criado (Impede duplicidade)
      const contact = await this.whatsappRepo.upsertEvolutionContact({
        organization_id: organizationId,
        wa_id: formattedTo, // Busca pelo número limpo
        display_name: dto.contactName || formattedTo // Se tiver nome no DTO, usa ele
      });

      // 5.2 Busca ou Cria a CONVERSA vinculada ao UUID do contato
      const conversation = await this.whatsappRepo.findOrCreateEvolutionConversation({
        organization_id: organizationId,
        account_id: account.id,
        contact_id: contact.id, // VINCULO POR ID, NÃO POR NÚMERO
        last_message_text: dto.text
      });

      // 6. Persiste a mensagem (O repository já faz o update do last_message)
      const savedMessage = await this.whatsappRepo.saveEvolutionMessage({
        conversation_id: conversation.id,
        message_id: evoRes.key.id,
        direction: 'outgoing',
        content: dto.text,
        whatsapp_date: new Date(),
      });

      return {
        ...savedMessage,
        conversation_id: conversation.id
      };

    } catch (error) {
      const errorData = error.response?.data;
      console.error('Erro no envio Evolution:', errorData || error.message);
      
      throw new InternalServerErrorException(
        `Erro ao enviar mensagem: ${errorData?.message || error.message}`
      );
    }
  }
}