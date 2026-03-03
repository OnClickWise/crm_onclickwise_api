import { Injectable, Logger } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';
import { TwilioWebhookDto } from '@/modules/whatsapp/dtos/receive-whatsapp-message.dto';

@Injectable()
export class ReceiveWhatsappWebhookUseCase {
  private readonly logger = new Logger(ReceiveWhatsappWebhookUseCase.name);

  constructor(private readonly whatsappRepo: WhatsappRepository) {}

  async execute(dto: TwilioWebhookDto) {
    // 1. Identifica o tenant pelo número de destino (To)
    const account = await this.whatsappRepo.getAccountByPhoneNumber(dto.To);
    if (!account) {
      this.logger.error(`Mensagem recebida para número não mapeado: ${dto.To}`);
      return;
    }

    // 2. Gerencia a conversa (Roteamento multi-tenant)
    const conversation = await this.whatsappRepo.findOrCreateConversation({
      organization_id: account.organization_id,
      account_id: account.id,
      whatsapp_username: dto.From,
    });

    // 3. Processamento de Mídia (se houver)
    const numMedia = parseInt(dto.NumMedia || '0');
    const hasMedia = numMedia > 0;
    
    // Captura metadados extras (como URLs de imagem da Twilio)
    const metadata: any = { ...dto };
    if (hasMedia) {
      metadata.mediaUrls = [];
      for (let i = 0; i < numMedia; i++) {
        metadata.mediaUrls.push(dto[`MediaUrl${i}`]);
      }
    }

    // 4. Salva a mensagem de entrada
    const message = await this.whatsappRepo.saveMessage({
      whatsapp_conversation_id: conversation.id,
      whatsapp_message_id: dto.MessageSid,
      direction: 'incoming',
      message_text: dto.Body,
      message_type: hasMedia ? 'photo' : 'text', // Simplificação: assume foto se houver media
      whatsapp_date: new Date(),
      is_from_account: false,
      is_read: false,
      message_metadata: metadata
    });

    // 5. Notificação em tempo real (Aqui entraria o Gateway de WebSocket)
    this.logger.log(`Mensagem recebida: ${dto.MessageSid} para Org: ${account.organization_id}`);
    
    return message;
  }
}