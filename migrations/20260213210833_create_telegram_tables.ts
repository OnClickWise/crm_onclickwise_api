import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Verificar se as tabelas dependentes existem
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasLeads = await knex.schema.hasTable('leads');
  
  if (!hasOrganizations) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }
  
  if (!hasLeads) {
    throw new Error('Table "leads" does not exist. Please run migrations in order.');
  }

  // 1. Create telegram_bots table
  await knex.schema.createTable('telegram_bots', function(table) {
    table.uuid('id').primary();
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.text('bot_name').notNullable();
    table.text('bot_username').notNullable();
    table.text('encrypted_token').notNullable(); // Token criptografado
    table.text('webhook_url');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Índices para melhor performance
    table.index(['organization_id']);
    table.index(['bot_username']);
    table.index(['is_active']);
  });

  // 2. Create telegram_accounts table
  await knex.schema.createTable('telegram_accounts', function(table) {
    table.uuid('id').primary();
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.text('api_id').notNullable();
    table.text('encrypted_api_hash').notNullable(); // API Hash criptografado
    table.text('phone_number').notNullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_authenticated').defaultTo(false);
    table.timestamp('authenticated_at', { useTz: true }).nullable();
    table.timestamp('expires_at', { useTz: true }).nullable();
    table.text('encrypted_2fa_password');
    table.integer('failed_2fa_attempts').notNullable().defaultTo(0);
    table.timestamp('last_2fa_error_at', { useTz: true });
    // Campos adicionados pelas outras migrations
    table.bigInteger('pts').defaultTo(0);
    table.bigInteger('qts').defaultTo(0);
    table.bigInteger('date').defaultTo(0);
    table.text('telegram_user_id').nullable(); // ID do usuário no Telegram
    table.text('telegram_username').nullable(); // Username do usuário no Telegram
    table.text('first_name').nullable(); // Nome do usuário no Telegram
    table.text('last_name').nullable(); // Sobrenome do usuário no Telegram
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Índices para melhor performance
    table.index(['organization_id']);
    table.index(['api_id']);
    table.index(['phone_number']);
    table.index(['is_active']);
  });

  // 3. Create telegram_account_sessions table
  await knex.schema.createTable('telegram_account_sessions', (table) => {
    table.uuid('id').primary();
    table.uuid('account_id').notNullable().references('id').inTable('telegram_accounts').onDelete('CASCADE');
    table.jsonb('data').notNullable().defaultTo('{}');
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['account_id']);
    table.index(['updated_at']);
  });

  // 4. Create telegram_conversations table
  await knex.schema.createTable('telegram_conversations', function(table) {
    table.uuid('id').primary();
    table.uuid('bot_id').nullable().references('id').inTable('telegram_bots').onDelete('CASCADE');
    table.uuid('account_id').nullable().references('id').inTable('telegram_accounts').onDelete('CASCADE');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('lead_id').nullable().references('id').inTable('leads').onDelete('SET NULL');
    table.bigInteger('telegram_chat_id').notNullable(); // ID do chat no Telegram
    table.text('telegram_user_id').nullable(); // ID do usuário no Telegram (nullable para grupos)
    table.text('telegram_username');
    table.text('first_name');
    table.text('last_name');
    table.text('phone_number');
    table.enum('chat_type', ['private', 'group', 'supergroup', 'channel']).defaultTo('private');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('last_message_at');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Índices para melhor performance
    table.index(['bot_id']);
    table.index(['account_id']);
    table.index(['organization_id']);
    table.index(['lead_id']);
    table.index(['telegram_chat_id']);
    table.index(['telegram_user_id']);
    table.index(['is_active']);
    table.index(['last_message_at']);
    
    // Garantir que não haja conversas duplicadas para o mesmo bot e chat
    table.unique(['bot_id', 'telegram_chat_id']);
    // Garantir que não haja conversas duplicadas para o mesmo account e chat
    table.unique(['account_id', 'telegram_chat_id']);
  });

  // 5. Create telegram_messages table
  await knex.schema.createTable('telegram_messages', function(table) {
    table.uuid('id').primary();
    table.uuid('conversation_id').references('id').inTable('telegram_conversations').onDelete('CASCADE');
    table.bigInteger('telegram_message_id').notNullable(); // ID da mensagem no Telegram
    table.enum('direction', ['incoming', 'outgoing']).notNullable(); // incoming = do usuário para o bot, outgoing = do bot para o usuário
    table.text('message_text'); // Texto da mensagem (apenas para texto simples)
    table.enum('message_type', ['text', 'photo', 'video', 'document', 'audio', 'voice', 'sticker', 'location', 'contact', 'poll']).defaultTo('text');
    table.text('file_id'); // ID do arquivo no Telegram (para mídias) - usado para buscar o arquivo
    table.text('caption'); // Legenda para mídias (texto pequeno)
    table.json('message_metadata'); // Metadados da mensagem (tamanho, duração, etc.)
    table.boolean('is_read').defaultTo(false);
    table.boolean('is_delivered').defaultTo(false);
    table.boolean('is_from_account').defaultTo(false);
    table.jsonb('read_by_users').defaultTo('[]'); // Array de IDs de usuários que leram a mensagem (como jsonb para suporte ao operador @>)
    table.timestamp('telegram_date', { useTz: true }); // Data da mensagem no Telegram
    // Campo adicionado pela migration 20251017000003
    table.binary('file_data'); // Dados binários do arquivo para arquivos MTProto
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Índices para melhor performance
    table.index(['conversation_id']);
    table.index(['telegram_message_id']);
    table.index(['direction']);
    table.index(['message_type']);
    table.index(['is_read']);
    table.index(['is_delivered']);
    table.index(['is_from_account']);
    table.index(['telegram_date']);
    table.index(['created_at']);
    
    // Garantir que não haja mensagens duplicadas
    table.unique(['conversation_id', 'telegram_message_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order due to foreign key constraints
  await knex.schema.dropTableIfExists('telegram_messages');
  await knex.schema.dropTableIfExists('telegram_conversations');
  await knex.schema.dropTableIfExists('telegram_account_sessions');
  await knex.schema.dropTableIfExists('telegram_accounts');
  await knex.schema.dropTableIfExists('telegram_bots');
}
