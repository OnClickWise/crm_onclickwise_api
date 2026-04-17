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
  constructor(@Inject('knex') private readonly knex: Knex) {}

  // ==========================================
  // ACCOUNTS (Contas Evolution)
  // ==========================================

  async upsertAccount(data: any): Promise<any> {
    const existing = await this.knex('evolution_whatsapp_accounts')
      .where((builder) => {
        if (data.organization_id) builder.where({ organization_id: data.organization_id });
        else if (data.instance_id) builder.where({ instance_id: data.instance_id });
        else if (data.instance_name) builder.whereRaw('LOWER(instance_name) = ?', [data.instance_name.toLowerCase()]);
      })
      .first();

    if (existing) {
      const [updated] = await this.knex('evolution_whatsapp_accounts')
        .where({ id: existing.id })
        .update({
          ...data,
          updated_at: this.knex.fn.now(),
        })
        .returning('*');
      
      return updated;
    }

    if (!data.organization_id) {
      throw new Error('Não é possível criar uma conta sem organization_id');
    }

    const [inserted] = await this.knex('evolution_whatsapp_accounts')
      .insert({
        id: uuidv4(),
        ...data,
      })
      .returning('*');

    return inserted;
  }

  async findByInstanceName(instanceName: string) {
    return this.knex('evolution_whatsapp_accounts')
      .where('instance_name', instanceName)
      .first();
  }

  async getEvolutionAccountByOrganizationId(organizationId: string): Promise<any | undefined> {
    return this.knex('evolution_whatsapp_accounts')
      .where({ organization_id: organizationId })
      .first();
  }

  // ==========================================
  // CONTACTS (Contatos Evolution)
  // ==========================================

  async upsertEvolutionContact(data: { 
    organization_id: string; 
    wa_id: string; 
    display_name: string; 
    profile_picture_url?: string 
  }) {
    const [contact] = await this.knex('evolution_whatsapp_contacts')
      .insert({
        id: uuidv4(),
        ...data,
        updated_at: this.knex.fn.now()
      })
      .onConflict(['organization_id', 'wa_id'])
      .merge(['display_name', 'profile_picture_url', 'updated_at'])
      .returning('*');

    return contact;
  }

  // ==========================================
  // CONVERSATIONS (Conversas Evolution)
  // ==========================================

  async findOrCreateEvolutionConversation(data: {
    organization_id: string,
    account_id: string,
    contact_id: string,
    last_message_text?: string
  }) {
    const existing = await this.knex('evolution_whatsapp_conversations')
      .where({
        organization_id: data.organization_id,
        account_id: data.account_id,
        contact_id: data.contact_id
      })
      .first();

    if (existing) return existing;

    const [inserted] = await this.knex('evolution_whatsapp_conversations')
      .insert({
        id: uuidv4(),
        organization_id: data.organization_id,
        account_id: data.account_id,
        contact_id: data.contact_id,
        last_message_text: data.last_message_text || '',
        last_message_at: new Date(),
        unread_count: 0,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    return inserted;
  }

  async getConversationsByOrganization(organizationId: string, limit = 50, offset = 0): Promise<any[]> {
    return this.knex('evolution_whatsapp_conversations')
      .leftJoin('evolution_whatsapp_contacts', function() {
        this.on('evolution_whatsapp_conversations.contact_id', '=', 'evolution_whatsapp_contacts.id')
          .andOn('evolution_whatsapp_conversations.organization_id', '=', 'evolution_whatsapp_contacts.organization_id');
      })
      .where({ 
        'evolution_whatsapp_conversations.organization_id': organizationId, 
        'evolution_whatsapp_conversations.is_active': true 
      })
      .select([
        'evolution_whatsapp_conversations.*',
        'evolution_whatsapp_contacts.wa_id as whatsapp_username', 
        'evolution_whatsapp_contacts.display_name as contact_name',
        
        this.knex('evolution_whatsapp_messages')
          .select('content')
          .whereRaw('evolution_whatsapp_messages.conversation_id = evolution_whatsapp_conversations.id')
          .orderBy('whatsapp_date', 'desc')
          .limit(1)
          .as('lastMessage'),

        this.knex('evolution_whatsapp_messages')
          .select('direction')
          .whereRaw('evolution_whatsapp_messages.conversation_id = evolution_whatsapp_conversations.id')
          .orderBy('whatsapp_date', 'desc')
          .limit(1)
          .as('lastMessageDirection') 
      ])
      .orderBy('evolution_whatsapp_conversations.last_message_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async markMessagesAsRead(conversationId: string, organizationId: string): Promise<void> {
    await this.knex('evolution_whatsapp_conversations')
      .where({ 
        id: conversationId, 
        organization_id: organizationId 
      })
      .update({ 
        unread_count: 0, 
        updated_at: new Date() 
      });
  }

  // ==========================================
  // MESSAGES (Mensagens Evolution)
  // ==========================================

  async saveEvolutionMessage(data: any) {
    return await this.knex.transaction(async (trx) => {
      const [message] = await trx('evolution_whatsapp_messages')
        .insert({
          id: uuidv4(),
          conversation_id: data.conversation_id,
          message_id: data.message_id, 
          direction: data.direction,
          content: data.content,
          whatsapp_date: data.whatsapp_date || this.knex.fn.now(),
          created_at: this.knex.fn.now(),
          updated_at: this.knex.fn.now()
        })
        .returning('*');

      const updateData: any = {
        last_message_text: data.content,
        last_message_at: data.whatsapp_date || this.knex.fn.now(),
        updated_at: this.knex.fn.now()
      };

      if (data.direction === 'incoming') {
        updateData.unread_count = trx.raw('unread_count + 1');
      }

      const [updatedConversation] = await trx('evolution_whatsapp_conversations')
        .where({ id: data.conversation_id })
        .update(updateData)
        .returning('*');

      return { ...message, conversation: updatedConversation };
    });
  }

  async getMessagesByConversation(conversationId: string, organizationId: string, limit: number, offset: number) {
    return this.knex('evolution_whatsapp_messages')
      .where({ conversation_id: conversationId })
      .orderBy('whatsapp_date', 'desc')
      .limit(limit)
      .offset(offset);
  }
}