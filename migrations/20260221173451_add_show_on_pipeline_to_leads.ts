import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('leads');
  if (!hasTable) {
    throw new Error('Table "leads" does not exist. Please run migrations in order.');
  }
  const hasColumn = await knex.raw(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'show_on_pipeline'
  `).then(res => res.rows.length > 0);
  if (hasColumn) {
    console.log('Coluna "show_on_pipeline" já existe, pulando criação');
    return;
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

