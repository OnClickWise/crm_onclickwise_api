import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. CONTATOS (evolution_whatsapp_contacts)
  await knex.schema.createTable('evolution_whatsapp_contacts', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    
    // JID da Evolution (ex: 5511999999999@s.whatsapp.net)
    table.string('wa_id', 60).notNullable().index(); 
    table.string('display_name', 255).nullable();
    table.string('profile_picture_url', 500).nullable();
    
    // Controle de status do contato (Decisão de salvar ou não)
    table.boolean('is_saved').notNullable().defaultTo(false);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'wa_id']);
  });

  // 2. CONVERSAS (evolution_whatsapp_conversations)
  await knex.schema.createTable('evolution_whatsapp_conversations', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('contact_id').notNullable().references('id').inTable('evolution_whatsapp_contacts').onDelete('CASCADE');
    table.uuid('account_id').notNullable().references('id').inTable('evolution_whatsapp_accounts').onDelete('CASCADE');
    
    // Controle de notificações e prévia na lista
    table.integer('unread_count').notNullable().defaultTo(0);
    table.text('last_message_text').nullable();
    table.timestamp('last_message_at').nullable();
    
    table.boolean('is_active').notNullable().defaultTo(true);
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'contact_id', 'account_id']);
  });

  // 3. MENSAGENS (evolution_whatsapp_messages)
  await knex.schema.createTable('evolution_whatsapp_messages', (table) => {
    table.uuid('id').primary();
    table.uuid('conversation_id').notNullable().references('id').inTable('evolution_whatsapp_conversations').onDelete('CASCADE');
    
    // ID único retornado pela Evolution (key.id)
    table.string('message_id', 150).notNullable().unique().index();
    
    table.string('direction', 20).notNullable(); // 'incoming' ou 'outgoing'
    table.string('type', 30).notNullable().defaultTo('text'); // text, image, audio, document...
    table.text('content').nullable();
    
    // Controle de leitura e status (sent, delivered, read)
    table.boolean('is_read').notNullable().defaultTo(false);
    table.string('status', 30).notNullable().defaultTo('pending'); 
    
    // Data exata em que a mensagem ocorreu no WhatsApp
    table.timestamp('whatsapp_date', { precision: 3 }).nullable();
    
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('evolution_whatsapp_messages');
  await knex.schema.dropTableIfExists('evolution_whatsapp_conversations');
  await knex.schema.dropTableIfExists('evolution_whatsapp_contacts');
}