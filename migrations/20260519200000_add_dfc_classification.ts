import type { Knex } from 'knex';

/**
 * Fase 3d — DFC (Demonstração de Fluxo de Caixa).
 *
 * Adiciona duas dimensões de classificação ao plano de contas:
 *
 *  - `is_cash_equivalent`: marca contas como caixa/banco/equivalentes de caixa.
 *    A DFC analisa lançamentos que tocam essas contas.
 *
 *  - `dfc_category`: categoriza cada conta nas 3 atividades da DFC —
 *    'operating' (operacional), 'investing' (investimento), 'financing'
 *    (financiamento). Quando null, o serviço usa um fallback baseado em
 *    account_type + nome da conta.
 *
 * Bootstrap: tenta marcar automaticamente contas existentes por padrão de
 * nome (caixa/banco → is_cash_equivalent; nome contém imobilizado →
 * investing; empréstimo/capital → financing; resto sem dfc_category).
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('accounting_chart_accounts'))) {
    throw new Error('accounting_chart_accounts não encontrada');
  }

  if (!(await knex.schema.hasColumn('accounting_chart_accounts', 'is_cash_equivalent'))) {
    await knex.schema.alterTable('accounting_chart_accounts', (table) => {
      table.boolean('is_cash_equivalent').notNullable().defaultTo(false);
      table.string('dfc_category', 20).nullable(); // operating | investing | financing
      table.index(['organization_id', 'is_cash_equivalent']);
      table.index(['organization_id', 'dfc_category']);
    });
  }

  // Bootstrap: auto-classifica contas existentes por padrão de nome.
  // Caixa/banco → is_cash_equivalent
  await knex.raw(`
    UPDATE accounting_chart_accounts
    SET is_cash_equivalent = true
    WHERE account_type = 'asset'
      AND (
        LOWER(name) ~ '(caixa|banco|cash|bank|disponível|disponivel)'
      )
      AND allows_posting = true
  `);

  // dfc_category — investing
  await knex.raw(`
    UPDATE accounting_chart_accounts
    SET dfc_category = 'investing'
    WHERE dfc_category IS NULL
      AND (
        LOWER(name) ~ '(imobilizad|ativo fixo|equipament|veículo|veiculo|móveis|moveis|máquinas|maquinas|investiment)'
      )
  `);

  // dfc_category — financing
  await knex.raw(`
    UPDATE accounting_chart_accounts
    SET dfc_category = 'financing'
    WHERE dfc_category IS NULL
      AND (
        (account_type = 'liability' AND LOWER(name) ~ '(empréstim|emprestim|financiament|loan|debêntur|debentur)')
        OR account_type = 'equity'
      )
  `);

  // dfc_category — operating (revenue, expense, demais)
  await knex.raw(`
    UPDATE accounting_chart_accounts
    SET dfc_category = 'operating'
    WHERE dfc_category IS NULL
      AND account_type IN ('revenue', 'expense')
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('accounting_chart_accounts', 'is_cash_equivalent')) {
    await knex.schema.alterTable('accounting_chart_accounts', (table) => {
      table.dropColumn('dfc_category');
      table.dropColumn('is_cash_equivalent');
    });
  }
}
