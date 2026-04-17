import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('evolution_whatsapp_accounts', (table) => {
    // Identificadores base seguindo seu padrão
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    
    // Identificação da Evolution API
    table.string('instance_name', 100).notNullable();
    table.string('instance_id', 120).notNullable().unique().index();
    table.string('instance_key', 120).nullable(); // O apikey retornado no bloco 'hash'
    
    // Dados do Dispositivo (preenchidos após conexão)
    table.string('wa_id', 40).nullable(); // Número do WhatsApp (JID)
    
    // Estados da Conexão
    table.string('status', 24).notNullable().defaultTo('created');
    table.boolean('is_authenticated').notNullable().defaultTo(false);
    
    // Bloco de Settings (Padrão Evolution API - inicializados em false)
    table.boolean('reject_call').notNullable().defaultTo(false);
    table.string('msg_call').nullable();
    table.boolean('groups_ignore').notNullable().defaultTo(false);
    table.boolean('always_online').notNullable().defaultTo(false);
    table.boolean('read_messages').notNullable().defaultTo(false);
    table.boolean('read_status').notNullable().defaultTo(false);
    table.boolean('sync_full_history').notNullable().defaultTo(false);

    // Auditoria padrão do projeto
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    // Regras de Unicidade
    // Garante que uma organização não tenha dois nomes de instâncias iguais
    table.unique(['organization_id', 'instance_name']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('evolution_whatsapp_accounts');
}