import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('boards', (table) => {
    table.uuid('id').primary();
    table.string('name').notNullable();
    table.text('description');
    table.uuid('project_id').notNullable().references('id').inTable('projects').onDelete('CASCADE');
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('boards');
}
