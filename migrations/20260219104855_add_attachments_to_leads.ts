import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('leads');
  if (!hasTable) {
    throw new Error('Table "leads" does not exist. Please run migrations in order.');
  }
  const hasColumn = await knex.schema.hasColumn('leads', 'attachments');
  if (hasColumn) {
    console.log('Coluna "attachments" já existe, pulando criação');
    return;
  }
  return knex.schema.alterTable('leads', function(table) {
    table.jsonb('attachments').defaultTo(JSON.stringify([]));
  });
}


export async function down(knex: Knex): Promise<void> {
    return knex.schema.alterTable('leads', function(table) {
    table.dropColumn('attachments');
  });
}

