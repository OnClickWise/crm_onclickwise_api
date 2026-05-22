import type { Knex } from 'knex';

/**
 * Integração Sales ↔ Receivables/Commissions:
 *
 *  - users.default_commission_pct: comissão padrão do vendedor (%). Quando um
 *    documento de venda vai para `invoiced`, a comissão é criada automaticamente
 *    se o usuário responsável tiver esse valor preenchido.
 *
 *  - sales_documents: já tem accounts_receivable ligado via reference_type=
 *    'sales_document' + reference_id=doc.id. Adicionamos índice composto para
 *    a query reverse (AR → doc) ficar O(log n).
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('users', 'default_commission_pct'))) {
    await knex.schema.alterTable('users', (table) => {
      // 0-100. NULL = sem auto-comissão.
      table.decimal('default_commission_pct', 6, 3).nullable();
    });
  }

  // Índice em (reference_type, reference_id) para lookup rápido de AR a partir
  // do sales document. Postgres exige criar índice fora do alterTable se já
  // existir um similar; usamos raw + IF NOT EXISTS para idempotência.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS accounts_receivable_reference_idx
    ON accounts_receivable (organization_id, reference_type, reference_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS accounts_receivable_reference_idx');
  if (await knex.schema.hasColumn('users', 'default_commission_pct')) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('default_commission_pct');
    });
  }
}
