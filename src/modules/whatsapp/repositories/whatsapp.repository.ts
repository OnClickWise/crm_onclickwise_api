// src/modules/whatsapp/repositories/whatsapp.repository.ts
import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { 
  WhatsappAccount, 
  WhatsappConversation, 
  WhatsappMessage 
} from '../entities/whatsapp.entities';

@Injectable()
export class WhatsappRepository {
  // Substitua 'KnexConnection' pelo token de injeção que você usa no seu projeto NestJS para o Knex
  constructor(@Inject('knex') private readonly knex: Knex) {}

  private conversationOrganizationColumnPromise: Promise<boolean> | null = null;

  private async hasConversationOrganizationColumn(): Promise<boolean> {
    if (!this.conversationOrganizationColumnPromise) {
      this.conversationOrganizationColumnPromise = this.knex.schema.hasColumn('whatsapp_conversations', 'organization_id');
    }

    return this.conversationOrganizationColumnPromise;
  }

  // ==========================================
  // ACCOUNTS (Contas / Organização)
  // ==========================================

  async upsertAccount(data: Omit<WhatsappAccount, 'id' | 'created_at' | 'updated_at'>): Promise<WhatsappAccount> {
    const existing = await this.knex('whatsapp_accounts')
      .where({ organization_id: data.organization_id })
      .first();

    if (existing) {
      const [updated] = await this.knex('whatsapp_accounts')
        .where({ id: existing.id })
        .update({
          ...data,
          updated_at: this.knex.fn.now(),
        })
        .returning('*');
      return updated;
    }

    const [inserted] = await this.knex('whatsapp_accounts')
      .insert({
        id: uuidv4(),
        ...data,
      })
      .returning('*');
    return inserted;
  }

  async getAccountByOrganizationId(organizationId: string): Promise<WhatsappAccount | undefined> {
    return this.knex('whatsapp_accounts')
      .where({ organization_id: organizationId })
      .first();
  }

  // Útil para quando o webhook da Twilio chegar e você precisar achar o tenant pelo número de destino
  async getAccountByPhoneNumber(phoneNumber: string): Promise<WhatsappAccount | undefined> {
    return this.knex('whatsapp_accounts')
      .where({ twilio_account_name: phoneNumber }) // Assumindo que você salva o número no account_name
      .first();
  }


  // ==========================================
  // CONVERSATIONS (Conversas / Leads)
  // ==========================================

  /**
   * Busca uma conversa existente ou cria uma nova.
   * Essencial para rotear mensagens recebidas no Webhook.
   */
  async findOrCreateConversation(data: {
    organization_id: string;
    account_id: string;
    whatsapp_username: string; // Número do cliente
    lead_id?: string;
  }): Promise<WhatsappConversation> {
    
    // 1. Tenta achar a conversa existente
    const existing = await this.knex('whatsapp_conversations as c')
      .join('whatsapp_accounts as a', 'a.id', 'c.account_id')
      .where({
        'a.organization_id': data.organization_id,
        'c.account_id': data.account_id,
        'c.whatsapp_username': data.whatsapp_username,
      })
      .first();

    if (existing) {
      // Se o lead_id foi passado agora e não tinha antes, atualiza
      if (data.lead_id && !existing.lead_id) {
        await this.updateConversation(existing.id, { lead_id: data.lead_id });
        existing.lead_id = data.lead_id;
      }
      return existing;
    }

    // 2. Se não existe, cria uma nova
    const newConversation: WhatsappConversation = {
      id: uuidv4(),
      organization_id: data.organization_id,
      account_id: data.account_id,
      whatsapp_username: data.whatsapp_username,
      lead_id: data.lead_id || null,
      is_active: true,
      chat_type: 'private',
      last_message_at: new Date(),
    };

    const conversationHasOrganizationColumn = await this.hasConversationOrganizationColumn();
    const insertPayload: Record<string, unknown> = {
      id: newConversation.id,
      account_id: newConversation.account_id,
      whatsapp_username: newConversation.whatsapp_username,
      lead_id: newConversation.lead_id,
      is_active: newConversation.is_active,
      chat_type: newConversation.chat_type,
      last_message_at: newConversation.last_message_at,
    };

    if (conversationHasOrganizationColumn) {
      insertPayload.organization_id = newConversation.organization_id;
    }

    const [inserted] = await this.knex('whatsapp_conversations')
      .insert(insertPayload)
      .returning('*');

    return inserted;
  }

  async getConversationsByOrganization(organizationId: string, limit = 50, offset = 0): Promise<WhatsappConversation[]> {
    return this.knex('whatsapp_conversations as c')
      .join('whatsapp_accounts as a', 'a.id', 'c.account_id')
      .where({ 'a.organization_id': organizationId, 'c.is_active': true })
      .select('c.*')
      .orderBy('last_message_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async updateConversation(id: string, data: Partial<WhatsappConversation>): Promise<void> {
    await this.knex('whatsapp_conversations')
      .where({ id })
      .update({
        ...data,
        updated_at: this.knex.fn.now(),
      });
  }


  // ==========================================
  // MESSAGES (Mensagens)
  // ==========================================

  async saveMessage(data: Omit<WhatsappMessage, 'id' | 'created_at'>, trx?: Knex.Transaction): Promise<WhatsappMessage> {
    const queryBuilder = trx ? trx('whatsapp_messages') : this.knex('whatsapp_messages');
    
    const [inserted] = await queryBuilder
      .insert({
        id: uuidv4(),
        ...data,
        message_metadata: data.message_metadata ? JSON.stringify(data.message_metadata) : null,
      })
      .returning('*');

    // Atualiza a data da última mensagem na conversa
    const updateConvBuilder = trx ? trx('whatsapp_conversations') : this.knex('whatsapp_conversations');
    await updateConvBuilder
      .where({ id: data.whatsapp_conversation_id })
      .update({ 
        last_message_at: data.whatsapp_date || this.knex.fn.now(),
        updated_at: this.knex.fn.now()
      });

    return inserted;
  }

  async getMessagesByConversation(conversationId: string, limit = 50, offset = 0): Promise<WhatsappMessage[]> {
    return this.knex('whatsapp_messages')
      .where({ whatsapp_conversation_id: conversationId })
      .orderBy('whatsapp_date', 'asc') // Histórico geralmente é lido do mais antigo pro mais novo na UI
      .limit(limit)
      .offset(offset);
  }

  async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    // Atualiza mensagens como lidas e adiciona o user_id no JSONB array
    await this.knex.raw(`
      UPDATE whatsapp_messages 
      SET 
        is_read = true,
        read_by_users = read_by_users || ?::jsonb
      WHERE 
        whatsapp_conversation_id = ? 
        AND direction = 'incoming'
        AND is_read = false
    `, [JSON.stringify([userId]), conversationId]);
  }
}