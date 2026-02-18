import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('organizations');
  if (!hasTable) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }
  
  return knex.schema.alterTable('organizations', function(table) {
    table.text('company_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable('organizations', function(table) {
    table.dropColumn('company_id');
  });
}
