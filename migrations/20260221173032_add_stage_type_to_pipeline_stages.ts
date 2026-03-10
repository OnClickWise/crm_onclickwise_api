import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('pipeline_stages');
  if (!hasTable) {
    throw new Error('Table "pipeline_stages" does not exist. Please run migrations in order.');
  }
  const hasColumn = await knex.raw(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'pipeline_stages' AND column_name = 'stage_type'
  `).then(res => res.rows.length > 0);
  if (hasColumn) {
    console.log('Coluna "stage_type" já existe, pulando criação');
    return;
  }
  await knex.schema.alterTable('pipeline_stages', (table) => {
    // Add stage_type column with enum values
    table.enum('stage_type', ['entry', 'progress', 'won', 'lost']).nullable();
    // Add comment to explain the column
    table.comment('Function/type of the stage for metrics calculations');
  });
  console.log('✅ Added stage_type column to pipeline_stages table');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('pipeline_stages', (table) => {
    table.dropColumn('stage_type');
  });
  
  console.log('✅ Removed stage_type column from pipeline_stages table');
}

