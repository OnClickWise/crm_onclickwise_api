import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { WhatsappRepository } from '@/modules/whatsapp/repositories/whatsapp.repository';
import { ChatGateway } from '@/modules/chat/chat.gateway';

@Injectable()
export class ReceiveWhatsappWebhookUseCase {
  private readonly logger = new Logger(ReceiveWhatsappWebhookUseCase.name);

  constructor(
    private readonly whatsappRepo: WhatsappRepository,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway
  ) {}

  async execute(payload: any) {
    const { event, instance, data } = payload;

    // 1. Filtro de evento
    if (event !== 'messages.upsert') {
      return;
    }

    // 2. Filtro para não processar as próprias mensagens enviadas (evita loop)
    if (data?.key?.fromMe) {
      return;
    }

    try {
      // 3. Busca a conta vinculada à instância Evolution
      const account = await this.whatsappRepo.findByInstanceName(instance);

      if (!account) {
        this.logger.error(`[Webhook] Nenhuma conta encontrada para a instância: "${instance}"`);
        return;
      }

      const messageData = data.message;

      // 4. Normalização do número do contato (JID)
      const rawFromNumber = data.key.remoteJidAlt || data.key.remoteJid;
      const cleanNumber = rawFromNumber.split('@')[0].replace(/\D/g, '');

      // 5. Extração do conteúdo da mensagem
      const messageBody =
        messageData?.conversation ||
        messageData?.extendedTextMessage?.text ||
        messageData?.imageMessage?.caption ||
        "";

      const messageId = data.key.id;
      
      // 6. Sincroniza o Contato (Garante que o UUID do contato exista na evolution_whatsapp_contacts)
      const contact = await this.whatsappRepo.upsertEvolutionContact({
        organization_id: account.organization_id,
        wa_id: cleanNumber,
        display_name: data.pushName || cleanNumber,
      });

      // 7. Gerencia a conversa (Roteamento multi-tenant usando IDs das tabelas evolution_)
      const conversation = await this.whatsappRepo.findOrCreateEvolutionConversation({
        organization_id: account.organization_id,
        account_id: account.id,
        contact_id: contact.id, // Passando o UUID do contato
      });

      // 8. Salva a mensagem e incrementa o unread_count (Tudo dentro da transação do Repository)
      const messageResult = await this.whatsappRepo.saveEvolutionMessage({
        conversation_id: conversation.id,
        message_id: messageId,
        direction: 'incoming',
        content: messageBody,
        whatsapp_date: new Date(data.messageTimestamp * 1000),
      });

      const enrichedConversation = {
      ...messageResult.conversation,
      // Adiciona as propriedades que o Front usa para exibir na lista
      contact_name: contact.display_name,    // Vem do passo 6 (upsertEvolutionContact)
      whatsapp_username: contact.wa_id,     // Vem do passo 6
      lastMessage: messageBody,              // Vem do passo 5 (Extração do conteúdo)
      lastMessageDirection: 'incoming'
    };

    // Avisa o Socket com o objeto completo
    this.chatGateway.emitWhatsappConversationUpdated(
      account.organization_id, 
      enrichedConversation 
    );

      // 10. Envia a mensagem em tempo real para o chat aberto
      this.chatGateway.emitMessageToChannel(
        account.organization_id, 
        conversation.id, 
        messageResult // Objeto da mensagem salva
      );

      this.logger.log(`Mensagem recebida e processada: ${messageId} (Org: ${account.organization_id})`);

      return messageResult;

    } catch (err) {
      this.logger.error(`[Webhook] ERRO CRÍTICO no processamento: ${err.message}`);
    }
  }
}