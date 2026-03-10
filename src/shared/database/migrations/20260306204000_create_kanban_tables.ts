import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('kanban_boards', (table) => {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.string('color').defaultTo('#6366f1');
    table.integer('workspace_id').unsigned();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('kanban_columns', (table) => {
    table.increments('id').primary();
    table.integer('board_id').unsigned().notNullable().references('id').inTable('kanban_boards').onDelete('CASCADE');
    table.string('title').notNullable();
    table.integer('position').notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('kanban_cards', (table) => {
    table.increments('id').primary();
    table.integer('column_id').unsigned().notNullable().references('id').inTable('kanban_columns').onDelete('CASCADE');
    table.string('title').notNullable();
    table.text('description');
    table.integer('position').notNullable();
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('kanban_cards');
  await knex.schema.dropTableIfExists('kanban_columns');
  await knex.schema.dropTableIfExists('kanban_boards');
}
