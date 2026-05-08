import type { Knex } from 'knex';

/**
 * Fase 2: Multi-moeda + Liquidações + Reconciliação bancária.
 *
 *  - exchange_rates: cotações por par de moedas + data. Permite buscar
 *    "AOA→BRL em 15/03/2026" de forma performática (índice composto).
 *
 *  - payment_allocations: vincula UM pagamento (de receivable_payments OU
 *    payable_payments) a UMA fatura (accounts_receivable OU accounts_payable),
 *    permitindo "1 pagamento → N faturas" e "1 fatura ← N pagamentos".
 *    Distingue origem via colunas {payment_kind, invoice_kind}.
 *
 *  - bank_statement_imports: agrupa as linhas importadas de um extrato (já
 *    existem bank_statements/bank_statement_lines, esta tabela apenas serve
 *    como cabeçalho de uma sessão de importação para auditoria/rollback).
 *
 *  - colunas extras em AR/AP/movimentos:
 *      currency, exchange_rate, base_amount  (valor convertido na moeda da org)
 */
export async function up(knex: Knex): Promise<void> {
  // ===== EXCHANGE RATES =====
  if (!(await knex.schema.hasTable('exchange_rates'))) {
    await knex.schema.createTable('exchange_rates', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Par de moedas: from_currency vai para to_currency.
      // 1 unidade de from_currency = `rate` unidades de to_currency.
      table.string('from_currency', 3).notNullable();
      table.string('to_currency', 3).notNullable();

      // Data de validade (cotação do dia). Para cotação intra-dia, usa-se o último valor inserido.
      table.date('rate_date').notNullable();

      // Taxa com 6 decimais para suportar moedas com câmbios pequenos (ex.: USD→AOA).
      table.decimal('rate', 18, 6).notNullable();

      // Origem: 'manual' | 'api_brapi' | 'api_openexchange' | 'imported' — só registro.
      table.string('source', 30).notNullable().defaultTo('manual');

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // unique() já cria índice composto automaticamente — não precisa de index() duplicado.
      table.unique(['organization_id', 'from_currency', 'to_currency', 'rate_date']);
    });
  }

  // ===== PAYMENT ALLOCATIONS =====
  if (!(await knex.schema.hasTable('payment_allocations'))) {
    await knex.schema.createTable('payment_allocations', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // 'receivable' | 'payable'
      table.string('payment_kind', 20).notNullable();
      // ID em receivable_payments ou payable_payments
      table.uuid('payment_id').notNullable();

      // 'receivable' | 'payable' (geralmente igual ao payment_kind)
      table.string('invoice_kind', 20).notNullable();
      // ID em accounts_receivable ou accounts_payable
      table.uuid('invoice_id').notNullable();

      table.decimal('amount', 18, 2).notNullable();

      // Quando o pagamento é em moeda diferente da fatura, registra a taxa usada.
      table.string('payment_currency', 3).nullable();
      table.string('invoice_currency', 3).nullable();
      table.decimal('exchange_rate', 18, 6).nullable();

      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'payment_kind', 'payment_id']);
      table.index(['organization_id', 'invoice_kind', 'invoice_id']);
    });
  }

  // ===== BANK STATEMENT IMPORTS =====
  if (!(await knex.schema.hasTable('bank_statement_imports'))) {
    await knex.schema.createTable('bank_statement_imports', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('bank_account_id')
        .notNullable()
        .references('id')
        .inTable('bank_accounts')
        .onDelete('CASCADE');
      table.uuid('statement_id').nullable().references('id').inTable('bank_statements').onDelete('SET NULL');

      // 'csv' | 'ofx' | 'manual'
      table.string('source_type', 20).notNullable().defaultTo('manual');
      table.string('source_filename', 255).nullable();
      table.integer('lines_imported').notNullable().defaultTo(0);
      table.integer('lines_matched').notNullable().defaultTo(0);

      table
        .enu('status', ['draft', 'imported', 'reconciled', 'rolled_back'])
        .notNullable()
        .defaultTo('imported');
      table.text('notes').nullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'bank_account_id']);
      table.index(['organization_id', 'status']);
    });
  }

  // ===== Vincular bank_statement_lines a um import (rastreabilidade) =====
  const slHasImport = await knex.schema.hasColumn('bank_statement_lines', 'import_id');
  if (!slHasImport) {
    await knex.schema.alterTable('bank_statement_lines', (table) => {
      table
        .uuid('import_id')
        .nullable()
        .references('id')
        .inTable('bank_statement_imports')
        .onDelete('SET NULL');
    });
  }

  // ===== Colunas multi-moeda em AR =====
  const arHasCurrency = await knex.schema.hasColumn('accounts_receivable', 'currency');
  const arHasFxRate = await knex.schema.hasColumn('accounts_receivable', 'exchange_rate');
  const arHasBase = await knex.schema.hasColumn('accounts_receivable', 'base_amount');
  if (!arHasCurrency || !arHasFxRate || !arHasBase) {
    await knex.schema.alterTable('accounts_receivable', (table) => {
      if (!arHasCurrency) table.string('currency', 3).nullable();
      if (!arHasFxRate) table.decimal('exchange_rate', 18, 6).nullable();
      if (!arHasBase) table.decimal('base_amount', 18, 2).nullable();
    });
  }

  // ===== Colunas multi-moeda em AP =====
  const apHasCurrency = await knex.schema.hasColumn('accounts_payable', 'currency');
  const apHasFxRate = await knex.schema.hasColumn('accounts_payable', 'exchange_rate');
  const apHasBase = await knex.schema.hasColumn('accounts_payable', 'base_amount');
  if (!apHasCurrency || !apHasFxRate || !apHasBase) {
    await knex.schema.alterTable('accounts_payable', (table) => {
      if (!apHasCurrency) table.string('currency', 3).nullable();
      if (!apHasFxRate) table.decimal('exchange_rate', 18, 6).nullable();
      if (!apHasBase) table.decimal('base_amount', 18, 2).nullable();
    });
  }

  // ===== Colunas multi-moeda em receivable_payments / payable_payments =====
  for (const tableName of ['receivable_payments', 'payable_payments']) {
    const hasCurrency = await knex.schema.hasColumn(tableName, 'currency');
    const hasFx = await knex.schema.hasColumn(tableName, 'exchange_rate');
    const hasBase = await knex.schema.hasColumn(tableName, 'base_amount');
    if (!hasCurrency || !hasFx || !hasBase) {
      await knex.schema.alterTable(tableName, (table) => {
        if (!hasCurrency) table.string('currency', 3).nullable();
        if (!hasFx) table.decimal('exchange_rate', 18, 6).nullable();
        if (!hasBase) table.decimal('base_amount', 18, 2).nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop columns added to existing tables (safe — nullable).
  for (const tableName of ['receivable_payments', 'payable_payments', 'accounts_receivable', 'accounts_payable']) {
    if (await knex.schema.hasTable(tableName)) {
      await knex.schema
        .alterTable(tableName, (table) => {
          table.dropColumn('base_amount');
          table.dropColumn('exchange_rate');
          table.dropColumn('currency');
        })
        .catch(() => undefined);
    }
  }

  if (await knex.schema.hasTable('bank_statement_lines')) {
    await knex.schema
      .alterTable('bank_statement_lines', (table) => {
        table.dropColumn('import_id');
      })
      .catch(() => undefined);
  }

  await knex.schema.dropTableIfExists('bank_statement_imports');
  await knex.schema.dropTableIfExists('payment_allocations');
  await knex.schema.dropTableIfExists('exchange_rates');
}
