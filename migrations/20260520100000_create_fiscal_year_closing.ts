import type { Knex } from 'knex';

/**
 * Fase 3e — Encerramento de Exercício.
 *
 *  - `fiscal_year_closings`: registro de cada exercício fechado por
 *    organização. Idempotência via unique(org, year). Guarda o resultado
 *    apurado (lucro/prejuízo) e o ID do lançamento de encerramento gerado.
 *
 *  - Em `accounting_chart_accounts`:
 *     * `is_income_summary` — conta "Apuração de Resultado do Exercício"
 *       (recebe receitas e despesas durante o fechamento; saldo é o
 *       lucro/prejuízo). Deve haver UMA por organização.
 *     * `is_retained_earnings` — conta "Lucros/Prejuízos Acumulados"
 *       (recebe o resultado do exercício no final). UMA por organização.
 *
 *  Bootstrap: tenta auto-marcar contas existentes por padrão de nome.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn('accounting_chart_accounts', 'is_income_summary'))) {
    await knex.schema.alterTable('accounting_chart_accounts', (table) => {
      table.boolean('is_income_summary').notNullable().defaultTo(false);
      table.boolean('is_retained_earnings').notNullable().defaultTo(false);
      table.index(['organization_id', 'is_income_summary']);
      table.index(['organization_id', 'is_retained_earnings']);
    });
  }

  // Auto-marca por padrão de nome (best-effort)
  await knex.raw(`
    UPDATE accounting_chart_accounts
    SET is_income_summary = true
    WHERE allows_posting = true
      AND is_active = true
      AND (
        LOWER(name) ~ '(apuração do resultado|apuracao do resultado|apuração de resultado|apuracao de resultado|resultado do exerc|income summary)'
      )
  `);

  await knex.raw(`
    UPDATE accounting_chart_accounts
    SET is_retained_earnings = true
    WHERE account_type = 'equity'
      AND allows_posting = true
      AND is_active = true
      AND (
        LOWER(name) ~ '(lucros acumulad|prejuízos acumulad|prejuizos acumulad|lucros e prejuíz|retained earnings)'
      )
  `);

  if (!(await knex.schema.hasTable('fiscal_year_closings'))) {
    await knex.schema.createTable('fiscal_year_closings', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.integer('year').notNullable();
      table.date('period_start').notNullable();
      table.date('period_end').notNullable();

      // 'open' (placeholder), 'closed', 'reopened'
      table.string('status', 20).notNullable().defaultTo('closed');

      table.decimal('total_revenue', 18, 2).notNullable().defaultTo(0);
      table.decimal('total_expense', 18, 2).notNullable().defaultTo(0);
      table.decimal('net_result', 18, 2).notNullable().defaultTo(0);

      // Lançamentos gerados (3 entries: zerar receitas, zerar despesas, transferir p/ LPA)
      table.uuid('closing_entry_id').nullable().references('id').inTable('accounting_journal_entries').onDelete('SET NULL');
      table.uuid('transfer_entry_id').nullable().references('id').inTable('accounting_journal_entries').onDelete('SET NULL');

      table.text('notes').nullable();

      table.uuid('closed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('closed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.uuid('reopened_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('reopened_at', { useTz: true }).nullable();
      table.text('reopen_reason').nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Não pode fechar duas vezes o mesmo ano (em estado 'closed' simultaneamente).
      // Permite ter um registro 'reopened' coexistindo com novo 'closed' se for refeito;
      // por simplicidade aqui usamos unique no ano e impediremos no serviço.
      table.unique(['organization_id', 'year']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('fiscal_year_closings');
  if (await knex.schema.hasColumn('accounting_chart_accounts', 'is_income_summary')) {
    await knex.schema.alterTable('accounting_chart_accounts', (table) => {
      table.dropColumn('is_retained_earnings');
      table.dropColumn('is_income_summary');
    });
  }
}
