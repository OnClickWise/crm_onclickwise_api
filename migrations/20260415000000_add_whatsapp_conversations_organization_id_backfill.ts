import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasConversations = await knex.schema.hasTable('whatsapp_conversations');
  const hasAccounts = await knex.schema.hasTable('whatsapp_accounts');

  if (!hasConversations || !hasAccounts) {
    console.log('whatsapp tables not found, skipping organization_id backfill');
    return;
  }

  const hasOrganizationId = await knex.schema.hasColumn(
    'whatsapp_conversations',
    'organization_id',
  );

  if (!hasOrganizationId) {
    console.log('Column whatsapp_conversations.organization_id not found, skipping backfill');
    return;
  }

  const updated = await knex('whatsapp_conversations as wc')
    .update({ organization_id: knex.ref('wa.organization_id') })
    .from('whatsapp_accounts as wa')
    .whereRaw('wc.account_id = wa.id')
    .whereNull('wc.organization_id')
    .whereNotNull('wa.organization_id');

  console.log(`Backfilled organization_id for ${updated} whatsapp_conversations rows`);
}

export async function down(): Promise<void> {
  // Intentionally no-op. This migration only fixes missing foreign-key data.
}
