import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Check if company_id column exists, if not add it
  const hasColumn = await knex.schema.hasColumn('organizations', 'company_id');
  
  if (!hasColumn) {
    await knex.schema.alterTable('organizations', function(table) {
      table.text('company_id');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Check if company_id column exists, if yes remove it
  const hasColumn = await knex.schema.hasColumn('organizations', 'company_id');
  
  if (hasColumn) {
    await knex.schema.alterTable('organizations', function(table) {
      table.dropColumn('company_id');
    });
  }
}

