import type { Knex } from 'knex';

/**
 * Diários e Documentos contábeis (inspirado no modelo do Primavera, mas adaptado).
 *
 * Conceito:
 *  - "Diário" agrupa lançamentos por natureza operacional (Vendas, Compras, Caixa, Bancos…),
 *    tem CÓDIGO numérico único por organização (ex.: 21, 31, 41, 51, 71, 72) e
 *    NUMERAÇÃO sequencial (contínua para todo o ano OU mensal).
 *  - "Documento" é um sub-tipo dentro do diário (NF, Recibo, Pagamento, Nota Crédito…),
 *    com código numérico (ex.: 411 dentro do diário 41) e contas-padrão opcionais
 *    para acelerar lançamentos automáticos.
 *  - "accounting_journal_entries" passa a referenciar diário/documento e a guardar
 *    o número sequencial do lançamento dentro daquele diário/período.
 */
export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasJournalEntries = await knex.schema.hasTable('accounting_journal_entries');
  const hasChartAccounts = await knex.schema.hasTable('accounting_chart_accounts');

  if (!hasOrganizations || !hasJournalEntries || !hasChartAccounts) {
    throw new Error(
      'Tabelas requeridas não encontradas. Rode primeiro a migration de accounting_finance_core.',
    );
  }

  // ===== DIÁRIOS =====
  const hasJournals = await knex.schema.hasTable('accounting_journals');
  if (!hasJournals) {
    await knex.schema.createTable('accounting_journals', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Código numérico curto (ex.: "21", "41", "51"). Único por organização.
      table.string('code', 10).notNullable();
      table.string('name', 120).notNullable();

      // Tipo operacional do diário — facilita filtros e relatórios.
      table
        .enu('journal_type', [
          'sales',
          'purchases',
          'cash',
          'bank',
          'diverse',
          'opening',
          'regularization',
          'closing',
          'depreciation',
          'payroll',
          'taxes',
        ])
        .notNullable()
        .defaultTo('diverse');

      // Modo de numeração da sequência interna de lançamentos.
      table
        .enu('numbering_mode', ['continuous', 'monthly'])
        .notNullable()
        .defaultTo('continuous');

      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);
      table.text('description').nullable();

      table
        .uuid('created_by')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table
        .uuid('updated_by')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.index(['organization_id', 'is_active']);
      table.index(['organization_id', 'journal_type']);
    });
  }

  // ===== DOCUMENTOS POR DIÁRIO =====
  const hasJournalDocs = await knex.schema.hasTable('accounting_journal_documents');
  if (!hasJournalDocs) {
    await knex.schema.createTable('accounting_journal_documents', (table) => {
      table.uuid('id').primary();
      table
        .uuid('journal_id')
        .notNullable()
        .references('id')
        .inTable('accounting_journals')
        .onDelete('CASCADE');
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Código do documento DENTRO do diário (ex.: "411" no diário "41").
      // Único por (organização, diário) — não bloqueia reuso entre diários distintos.
      table.string('code', 10).notNullable();
      table.string('name', 120).notNullable();

      // Contas padrão (opcionais) — pré-preenchem o lançamento ao usar o documento.
      table
        .uuid('default_debit_account_id')
        .nullable()
        .references('id')
        .inTable('accounting_chart_accounts')
        .onDelete('SET NULL');
      table
        .uuid('default_credit_account_id')
        .nullable()
        .references('id')
        .inTable('accounting_chart_accounts')
        .onDelete('SET NULL');

      table.boolean('allows_recapitulative').notNullable().defaultTo(false);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);
      table.text('description').nullable();

      table
        .uuid('created_by')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table
        .uuid('updated_by')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'journal_id', 'code']);
      table.index(['organization_id', 'is_active']);
    });
  }

  // ===== Vincular journal_entries a diário/documento =====
  // Adiciona colunas só se ainda não existirem (idempotente).
  const entriesHasJournalId = await knex.schema.hasColumn(
    'accounting_journal_entries',
    'journal_id',
  );
  const entriesHasDocumentId = await knex.schema.hasColumn(
    'accounting_journal_entries',
    'document_id',
  );
  const entriesHasJournalNumber = await knex.schema.hasColumn(
    'accounting_journal_entries',
    'journal_number',
  );
  const entriesHasJournalPeriod = await knex.schema.hasColumn(
    'accounting_journal_entries',
    'journal_period',
  );

  if (!entriesHasJournalId || !entriesHasDocumentId || !entriesHasJournalNumber || !entriesHasJournalPeriod) {
    await knex.schema.alterTable('accounting_journal_entries', (table) => {
      if (!entriesHasJournalId) {
        table
          .uuid('journal_id')
          .nullable()
          .references('id')
          .inTable('accounting_journals')
          .onDelete('SET NULL');
      }
      if (!entriesHasDocumentId) {
        table
          .uuid('document_id')
          .nullable()
          .references('id')
          .inTable('accounting_journal_documents')
          .onDelete('SET NULL');
      }
      if (!entriesHasJournalNumber) {
        // Número sequencial do lançamento dentro do diário (e mês, quando aplicável).
        table.integer('journal_number').nullable();
      }
      if (!entriesHasJournalPeriod) {
        // Formato "YYYY-MM" para numbering_mode=monthly ou "YYYY" para continuous.
        // Permite calcular sequência por janela e exibir "Diário 41 – Doc 411 – Nº 87/MAY".
        table.string('journal_period', 10).nullable();
      }
    });

    // Índices para suportar consulta sequencial e relatórios por diário.
    await knex.schema.alterTable('accounting_journal_entries', (table) => {
      table.index(['organization_id', 'journal_id', 'journal_period', 'journal_number'], 'idx_journal_entries_seq');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove primeiro as colunas dependentes para não quebrar FKs.
  const hasEntries = await knex.schema.hasTable('accounting_journal_entries');
  if (hasEntries) {
    await knex.schema.alterTable('accounting_journal_entries', (table) => {
      table.dropIndex([], 'idx_journal_entries_seq');
    }).catch(() => undefined);

    await knex.schema.alterTable('accounting_journal_entries', (table) => {
      table.dropColumn('journal_period');
      table.dropColumn('journal_number');
      table.dropColumn('document_id');
      table.dropColumn('journal_id');
    }).catch(() => undefined);
  }

  await knex.schema.dropTableIfExists('accounting_journal_documents');
  await knex.schema.dropTableIfExists('accounting_journals');
}
