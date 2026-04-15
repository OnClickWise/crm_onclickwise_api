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

  await knex('whatsapp_conversations as c')
    .update({ organization_id: knex.ref('a.organization_id') })
    .from({ c: 'whatsapp_conversations' })
    .join({ a: 'whatsapp_accounts' }, 'a.id', 'c.account_id')
    .whereNull('c.organization_id')
    .whereNotNull('c.account_id');
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