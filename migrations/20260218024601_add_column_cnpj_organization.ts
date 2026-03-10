import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('organizations');
  if (!hasTable) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }
  const hasColumn = await knex.schema.hasColumn('organizations', 'company_id');
  if (hasColumn) {
    console.log('Coluna "company_id" já existe, pulando criação');
    return;
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
