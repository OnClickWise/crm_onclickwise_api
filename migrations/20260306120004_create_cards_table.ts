import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cards', (table) => {
    table.uuid('id').primary();
    table.string('title').notNullable();
    table.text('description');
    table.uuid('list_id').notNullable().references('id').inTable('lists').onDelete('CASCADE');
    table.integer('order').unsigned().notNullable();
    table.date('due_date');
    table.uuid('created_by').notNullable().references('id').inTable('users');
    table.uuid('assigned_to').references('id').inTable('users');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('cards');
}
