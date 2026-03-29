import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chat_channels', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.string('name', 80).notNullable();
    table.string('slug', 120).notNullable();
    table.text('description').nullable();
    table.boolean('is_private').notNullable().defaultTo(false);
    table.uuid('created_by').notNullable();
    table.timestamp('last_message_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'slug']);
  });

  await knex.schema.createTable('chat_channel_members', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('channel_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.string('role', 24).notNullable().defaultTo('member');
    table.uuid('last_read_message_id').nullable();
    table.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'channel_id', 'user_id']);
  });

  await knex.schema.createTable('chat_messages', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('channel_id').notNullable().index();
    table.uuid('sender_user_id').notNullable().index();
    table.text('body').notNullable();
    table.string('message_type', 24).notNullable().defaultTo('text');
    table.jsonb('metadata').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('chat_message_reads', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('message_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.timestamp('read_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'message_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_message_reads');
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_channel_members');
  await knex.schema.dropTableIfExists('chat_channels');
}
