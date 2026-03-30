import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('whatsapp_conversations');
  if (!hasTable) {
    console.log('Table "whatsapp_conversations" does not exist, skipping migration');
    return;
  }

  const hasColumn = await knex.schema.hasColumn('whatsapp_conversations', 'organization_id');
  if (!hasColumn) {
    await knex.schema.alterTable('whatsapp_conversations', function(table) {
      table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
      table.index('organization_id');
    });
    console.log('✅ Added organization_id column to whatsapp_conversations');
  } else {
    console.log('Column "organization_id" already exists in whatsapp_conversations, skipping');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('whatsapp_conversations');
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn('whatsapp_conversations', 'organization_id');
  if (hasColumn) {
    await knex.schema.alterTable('whatsapp_conversations', function(table) {
      table.dropColumn('organization_id');
    });
  }
}
