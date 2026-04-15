import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasConversations = await knex.schema.hasTable('whatsapp_conversations');
  const hasAccounts = await knex.schema.hasTable('whatsapp_accounts');

  if (!hasConversations || !hasAccounts) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn('whatsapp_conversations', 'organization_id');
  if (!hasColumn) {
    await knex.schema.alterTable('whatsapp_conversations', (table) => {
      table.uuid('organization_id').nullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.index('organization_id');
    });
  }

  await knex.raw(`
    UPDATE whatsapp_conversations AS c
    SET organization_id = a.organization_id
    FROM whatsapp_accounts AS a
    WHERE c.account_id = a.id
      AND c.organization_id IS NULL
      AND c.account_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasConversations = await knex.schema.hasTable('whatsapp_conversations');
  if (!hasConversations) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn('whatsapp_conversations', 'organization_id');
  if (hasColumn) {
    await knex.schema.alterTable('whatsapp_conversations', (table) => {
      table.dropColumn('organization_id');
    });
  }
}