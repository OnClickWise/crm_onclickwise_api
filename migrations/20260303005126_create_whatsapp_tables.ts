import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {

    const hasOrganizations = await knex.schema.hasTable('organizations');
    const hasLeads = await knex.schema.hasTable('leads');

    if (!hasOrganizations) {
        throw new Error('Table "organizations" does not exist. Please run migrations in order.');
    }
    
    if (!hasLeads) {
        throw new Error('Table "leads" does not exist. Please run migrations in order.');
    }


    await knex.schema.createTable('whatsapp_accounts', function(table) {
    table.uuid('id').primary();
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.string('twilio_account_name').notNullable();
    table.string('twilio_account_sid').notNullable();
    table.string('twilio_auth_token').notNullable();
    table.boolean('is_authenticated').defaultTo(false);
    table.timestamp('authenticated_at', { useTz: true }).nullable();
    table.timestamp('expires_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });


  await knex.schema.createTable('whatsapp_conversations', function(table) {
    table.uuid('id').primary();
    table.uuid('account_id').nullable().references('id').inTable('whatsapp_accounts').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.text('whatsapp_username').nullable();
    table.uuid('lead_id').nullable().references('id').inTable('leads').onDelete('SET NULL');
    table.enum('chat_type', ['private', 'group']).defaultTo('private');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_message_at');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });


  await knex.schema.createTable('whatsapp_messages', function(table) {
    table.uuid('id').primary();
    table.uuid('whatsapp_conversation_id').references('id').inTable('whatsapp_conversations').onDelete('CASCADE');
    table.text('whatsapp_message_id').notNullable();
    table.enum('direction', ['incoming', 'outgoing']).notNullable(); 
    table.text('message_text');
    table.enum('message_type', ['text', 'photo', 'video', 'document', 'audio', 'voice', 'sticker', 'location', 'contact', 'poll']).defaultTo('text');
    table.text('caption'); 
    table.json('message_metadata');
    table.timestamp('whatsapp_date', { useTz: true });
    table.boolean('is_read').defaultTo(false);
    table.boolean('is_delivered').defaultTo(false);
    table.boolean('is_from_account').defaultTo(false);
    table.binary('attachment_file_data');
    table.jsonb('read_by_users').defaultTo('[]');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  
    table.index(['whatsapp_conversation_id']);
    table.index(['whatsapp_message_id']);
    table.index(['direction']);
    table.index(['message_type']);
    table.index(['is_read']);
    table.index(['is_delivered']);
    table.index(['is_from_account']);
    table.index(['created_at']);
    table.unique(['whatsapp_conversation_id', 'whatsapp_message_id']);
  });
}

export async function down(knex: Knex): Promise<void> {

}