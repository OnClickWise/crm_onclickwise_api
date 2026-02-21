import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('leads');
  if (!hasTable) {
    throw new Error('Table "leads" does not exist. Please run migrations in order.');
  }
  
  return knex.schema.alterTable('leads', function(table) {
    table.boolean('show_on_pipeline').defaultTo(false).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable('leads', function(table) {
    table.dropColumn('show_on_pipeline');
  });
}

