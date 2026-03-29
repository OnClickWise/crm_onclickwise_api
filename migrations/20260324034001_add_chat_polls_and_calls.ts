import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('chat_polls', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('channel_id').notNullable().index();
    table.uuid('created_by').notNullable().index();
    table.string('question', 240).notNullable();
    table.boolean('allow_multiple').notNullable().defaultTo(false);
    table.boolean('is_closed').notNullable().defaultTo(false);
    table.timestamp('ends_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('chat_poll_options', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('poll_id').notNullable().index();
    table.string('label', 120).notNullable();
    table.integer('position').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('chat_poll_votes', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('poll_id').notNullable().index();
    table.uuid('option_id').notNullable().index();
    table.uuid('user_id').notNullable().index();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'poll_id', 'option_id', 'user_id']);
  });

  await knex.schema.createTable('chat_call_sessions', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().index();
    table.uuid('channel_id').notNullable().index();
    table.uuid('created_by').notNullable().index();
    table.string('call_type', 24).notNullable().defaultTo('video');
    table.string('provider', 32).notNullable().defaultTo('jitsi');
    table.text('meeting_url').notNullable();
    table.string('status', 24).notNullable().defaultTo('active');
    table.timestamp('started_at').nullable();
    table.timestamp('ended_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('chat_call_sessions');
  await knex.schema.dropTableIfExists('chat_poll_votes');
  await knex.schema.dropTableIfExists('chat_poll_options');
  await knex.schema.dropTableIfExists('chat_polls');
}
