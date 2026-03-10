import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Habilitar extensão uuid-ossp se ainda não estiver ativa
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await knex.schema.createTable('kanban_boards', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('title').notNullable();
    table.uuid('project_id').references('id').inTable('projects').onDelete('CASCADE');
    table.uuid('workspace_id');
    table.string('color').defaultTo('#6366f1');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('kanban_columns', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('title').notNullable();
    table.uuid('board_id').notNullable().references('id').inTable('kanban_boards').onDelete('CASCADE');
    table.integer('position').notNullable().defaultTo(0);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('kanban_cards', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('title').notNullable();
    table.text('description');
    table.uuid('column_id').notNullable().references('id').inTable('kanban_columns').onDelete('CASCADE');
    table.integer('position').notNullable().defaultTo(0);
    table.date('due_date');
    table.uuid('assigned_to').references('id').inTable('users');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('kanban_cards');
  await knex.schema.dropTableIfExists('kanban_columns');
  await knex.schema.dropTableIfExists('kanban_boards');
}
