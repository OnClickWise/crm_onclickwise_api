import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('organizations');
  if (!hasTable) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }
  const hasColumn = await knex.schema.hasColumn('organizations', 'password');
  if (hasColumn) {
    console.log('Coluna "password" já existe, pulando criação');
    return;
  }
  return knex.schema.alterTable('organizations', function(table) {
    table.text('password');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable('organizations', function(table) {
    table.dropColumn('password');
  });
}
