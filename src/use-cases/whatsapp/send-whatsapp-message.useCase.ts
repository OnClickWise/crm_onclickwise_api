// src/modules/whatsapp/use-cases/send-whatsapp-message.usecase.ts

import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';
import { SendWhatsappMessageDto } from '@/modules/whatsapp/dtos/send-message-dto';
// Se o erro persistir, use: import twilio = require('twilio');
import twilio from 'twilio'; 

@Injectable()
export class SendWhatsappMessageUseCase {
  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  /**
   * Executa o fluxo de envio de mensagem multi-tenant.
   * 1. Busca as credenciais específicas da organização (Tenant).
   * 2. Inicializa o cliente Twilio dinamicamente.
   * 3. Garante a existência da conversa e do lead.
   * 4. Registra a mensagem no banco de dados.
   */
  async execute(organizationId: string, dto: SendWhatsappMessageDto) {
    // 1. Busca as configurações da conta vinculada a esta organização
    const account = await this.whatsappRepo.getAccountByOrganizationId(organizationId);
    
    if (!account) {
      throw new NotFoundException('Nenhuma conta de WhatsApp configurada para esta organização.');
    }

    // 2. Formata os números no padrão E.164 exigido pela Twilio
    const formattedTo = dto.to.startsWith('whatsapp:') ? dto.to : `whatsapp:${dto.to}`;
    const formattedFrom = account.twilio_account_name.startsWith('whatsapp:') 
      ? account.twilio_account_name 
      : `whatsapp:${account.twilio_account_name}`;

    try {
      // 3. Inicializa o cliente Twilio com as credenciais do Tenant
      const client = twilio(account.twilio_account_sid, account.twilio_auth_token);

      // 4. Dispara a mensagem via API
      const twilioRes = await client.messages.create({
        body: dto.text,
        from: formattedFrom,
        to: formattedTo,
      });

      // 5. Garante que a conversa existe (findOrCreate)
      const conversation = await this.whatsappRepo.findOrCreateConversation({
        organization_id: organizationId,
        account_id: account.id,
        whatsapp_username: formattedTo,
        lead_id: dto.leadId
      });

      // 6. Persiste a mensagem no histórico
      const savedMessage = await this.whatsappRepo.saveMessage({
        whatsapp_conversation_id: conversation.id,
        whatsapp_message_id: twilioRes.sid, // SID único da Twilio para rastreio posterior
        direction: 'outgoing',
        message_text: dto.text,
        message_type: 'text',
        whatsapp_date: new Date(),
        is_from_account: true,
        is_delivered: false, // Será atualizado pelo Webhook de Status
        message_metadata: {
          twilio_status: twilioRes.status,
          api_version: twilioRes.apiVersion
        }
      });

      return savedMessage;

    } catch (error) {
      // Tratamento de erro específico para falhas na API da Twilio
      console.error('Erro ao enviar mensagem via Twilio:', error);
      throw new InternalServerErrorException(
        `Falha na comunicação com o WhatsApp: ${error}`
      );
    }
  }
}