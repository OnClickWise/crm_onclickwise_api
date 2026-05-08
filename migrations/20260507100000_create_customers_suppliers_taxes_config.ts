import type { Knex } from 'knex';

/**
 * Fundação Universal Multi-jurisdição:
 *
 *  - customers / suppliers: cadastros standalone com TaxID genérico (CNPJ/NIF/SSN/TIN/SIRET).
 *    O campo `tax_id_type` indica QUAL identificador foi cadastrado (sem amarrar a
 *    um país específico — cada org pode ter clientes de múltiplos países).
 *
 *  - tax_rates: alíquotas configuráveis pela organização (IVA AO 14%, ICMS BR 18%,
 *    TVA FR 20%, Sales tax US, etc). Aplicáveis em journal_entry_lines, faturas e
 *    movimentos. NÃO emite impostos automaticamente — o cliente configura suas regras.
 *
 *  - organization_finance_config: configuração regional por organização (locale,
 *    moeda padrão, mês de início do exercício fiscal, país, modo de imposto).
 *
 *  - colunas em accounts_receivable/payable: customer_id/supplier_id REAIS (FK), além
 *    do nome livre que já existia (mantido para compat).
 *
 *  - colunas em journal_entry_lines: tax_rate_id e tax_amount (opcionais, somente
 *    quando o lançamento tiver imposto separado).
 */
export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    throw new Error('Tabela organizations não encontrada. Rode migrations anteriores.');
  }

  // ===== CUSTOMERS =====
  if (!(await knex.schema.hasTable('customers'))) {
    await knex.schema.createTable('customers', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Código curto do cliente (opcional, único por org). Permite "C001", "CLI-ABC".
      table.string('code', 40).nullable();
      table.string('name', 255).notNullable();
      table.string('legal_name', 255).nullable();

      // Identificação fiscal — genérica para suportar qualquer país.
      // tax_id_type: 'cnpj' | 'cpf' | 'nif' | 'ssn' | 'tin' | 'siret' | 'nipc' | 'rfc' | 'cif' | 'other'
      table.string('tax_id', 50).nullable();
      table.string('tax_id_type', 20).nullable();

      // Contato
      table.string('email', 255).nullable();
      table.string('phone', 50).nullable();
      table.string('mobile', 50).nullable();
      table.string('website', 255).nullable();

      // Endereço (todos opcionais)
      table.string('address_line1', 255).nullable();
      table.string('address_line2', 255).nullable();
      table.string('city', 120).nullable();
      table.string('state', 120).nullable();
      table.string('postal_code', 30).nullable();
      // Country = ISO 3166-1 alpha-2 ('BR', 'AO', 'PT', 'ES', 'FR', 'US'...).
      table.string('country', 2).nullable();

      // Comercial
      table.string('default_currency', 3).nullable();
      table.integer('payment_terms_days').notNullable().defaultTo(0);
      table.decimal('credit_limit', 18, 2).nullable();

      // Retenções (Angola/Portugal): pode ser NULL ou e.g. {"type":"estado","rate":6.5}
      table.jsonb('withholding_config').nullable();

      // Operacional
      table.boolean('is_active').notNullable().defaultTo(true);
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      // Permite mesmo tax_id em orgs diferentes (multi-tenant), mas não duplicado dentro da mesma org.
      table.unique(['organization_id', 'tax_id']);
      table.index(['organization_id', 'is_active']);
      table.index(['organization_id', 'name']);
    });
  }

  // ===== SUPPLIERS =====
  if (!(await knex.schema.hasTable('suppliers'))) {
    await knex.schema.createTable('suppliers', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('code', 40).nullable();
      table.string('name', 255).notNullable();
      table.string('legal_name', 255).nullable();

      table.string('tax_id', 50).nullable();
      table.string('tax_id_type', 20).nullable();

      table.string('email', 255).nullable();
      table.string('phone', 50).nullable();
      table.string('website', 255).nullable();

      table.string('address_line1', 255).nullable();
      table.string('address_line2', 255).nullable();
      table.string('city', 120).nullable();
      table.string('state', 120).nullable();
      table.string('postal_code', 30).nullable();
      table.string('country', 2).nullable();

      // Bancário (para pagamentos)
      table.string('bank_name', 255).nullable();
      table.string('bank_account', 100).nullable();
      table.string('bank_iban', 50).nullable();
      table.string('bank_swift', 20).nullable();

      table.string('default_currency', 3).nullable();
      table.integer('payment_terms_days').notNullable().defaultTo(0);

      table.jsonb('withholding_config').nullable();

      table.boolean('is_active').notNullable().defaultTo(true);
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.unique(['organization_id', 'tax_id']);
      table.index(['organization_id', 'is_active']);
      table.index(['organization_id', 'name']);
    });
  }

  // ===== TAX_RATES =====
  if (!(await knex.schema.hasTable('tax_rates'))) {
    await knex.schema.createTable('tax_rates', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Código curto único: "IVA-14" (AO), "ICMS-18" (BR-SP), "TVA-20" (FR), "VAT-21" (ES)...
      table.string('code', 30).notNullable();
      table.string('name', 120).notNullable();

      // Tipo: 'vat' (IVA/TVA/VAT), 'sales_tax' (US state tax), 'withholding' (retenção),
      // 'icms', 'iss', 'ipi', 'pis', 'cofins', 'other'.
      table.string('tax_type', 30).notNullable();

      // Alíquota em percentual: 14.00 = 14%
      table.decimal('rate', 6, 3).notNullable();

      // País aplicável (opcional, ISO alpha-2). Permite filtrar IVA-14 só para AO etc.
      table.string('country', 2).nullable();

      // Conta contábil de débito/crédito padrão para esse imposto (opcional).
      // Quando lançamento tiver tax, o sistema pode sugerir a conta correspondente.
      table
        .uuid('account_id')
        .nullable()
        .references('id')
        .inTable('accounting_chart_accounts')
        .onDelete('SET NULL');

      table.boolean('is_default').notNullable().defaultTo(false);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.text('description').nullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.index(['organization_id', 'is_active']);
      table.index(['organization_id', 'tax_type']);
    });
  }

  // ===== ORGANIZATION_FINANCE_CONFIG =====
  if (!(await knex.schema.hasTable('organization_finance_config'))) {
    await knex.schema.createTable('organization_finance_config', (table) => {
      table
        .uuid('organization_id')
        .primary()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Locale para formatação de números/datas: 'pt-BR', 'pt-AO', 'pt-PT', 'es-ES', 'fr-FR', 'en-US'
      table.string('locale', 10).notNullable().defaultTo('pt-BR');

      // Moeda padrão da organização (ISO 4217). Não impede multi-moeda.
      table.string('default_currency', 3).notNullable().defaultTo('BRL');

      // País principal (ISO alpha-2). Define defaults razoáveis para taxes/templates.
      table.string('country', 2).notNullable().defaultTo('BR');

      // Mês de início do exercício fiscal (1-12). BR/PT/AO geralmente 1 (jan); US fiscal Y comum em out (10).
      table.integer('fiscal_year_start_month').notNullable().defaultTo(1);

      // Modo do imposto: 'inclusive' (preços já incluem imposto), 'exclusive' (impostos somam-se), 'none'.
      table.string('tax_mode', 20).notNullable().defaultTo('exclusive');

      // Formato de número decimal e separador de milhares — para exports culturais.
      table.string('decimal_separator', 1).notNullable().defaultTo(',');
      table.string('thousands_separator', 1).notNullable().defaultTo('.');

      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  // ===== Colunas extras em accounts_receivable / accounts_payable =====
  // Já existem customer_id/supplier_id (uuid nullable, sem FK). Adicionamos FK real
  // sem quebrar registros antigos (ON DELETE SET NULL preserva o nome livre).
  const arHasCustomerFk = await knex.raw<{ rows: { conname: string }[] }>(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'accounts_receivable'::regclass
       AND contype = 'f'
       AND conname LIKE '%customer%'`,
  );
  if (arHasCustomerFk.rows.length === 0 && (await knex.schema.hasTable('customers'))) {
    await knex.schema.alterTable('accounts_receivable', (table) => {
      table
        .foreign('customer_id')
        .references('id')
        .inTable('customers')
        .onDelete('SET NULL');
    });
  }

  const apHasSupplierFk = await knex.raw<{ rows: { conname: string }[] }>(
    `SELECT conname FROM pg_constraint
     WHERE conrelid = 'accounts_payable'::regclass
       AND contype = 'f'
       AND conname LIKE '%supplier%'`,
  );
  if (apHasSupplierFk.rows.length === 0 && (await knex.schema.hasTable('suppliers'))) {
    await knex.schema.alterTable('accounts_payable', (table) => {
      table
        .foreign('supplier_id')
        .references('id')
        .inTable('suppliers')
        .onDelete('SET NULL');
    });
  }

  // ===== Colunas de imposto em journal_entry_lines =====
  const linesHasTaxRate = await knex.schema.hasColumn(
    'accounting_journal_entry_lines',
    'tax_rate_id',
  );
  const linesHasTaxAmount = await knex.schema.hasColumn(
    'accounting_journal_entry_lines',
    'tax_amount',
  );
  if (!linesHasTaxRate || !linesHasTaxAmount) {
    await knex.schema.alterTable('accounting_journal_entry_lines', (table) => {
      if (!linesHasTaxRate) {
        table
          .uuid('tax_rate_id')
          .nullable()
          .references('id')
          .inTable('tax_rates')
          .onDelete('SET NULL');
      }
      if (!linesHasTaxAmount) {
        // Valor monetário do imposto separado, quando aplicável.
        table.decimal('tax_amount', 18, 2).nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove colunas extras antes das tabelas referenciadas.
  if (await knex.schema.hasTable('accounting_journal_entry_lines')) {
    await knex.schema
      .alterTable('accounting_journal_entry_lines', (table) => {
        table.dropColumn('tax_amount');
        table.dropColumn('tax_rate_id');
      })
      .catch(() => undefined);
  }

  // FKs em AR/AP: não dropamos colunas (existiam antes), só as constraints adicionadas.
  await knex
    .raw(
      `DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounts_receivable'::regclass AND conname LIKE '%customer%') THEN
           ALTER TABLE accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivable_customer_id_foreign;
         END IF;
         IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounts_payable'::regclass AND conname LIKE '%supplier%') THEN
           ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_supplier_id_foreign;
         END IF;
       END $$;`,
    )
    .catch(() => undefined);

  await knex.schema.dropTableIfExists('organization_finance_config');
  await knex.schema.dropTableIfExists('tax_rates');
  await knex.schema.dropTableIfExists('suppliers');
  await knex.schema.dropTableIfExists('customers');
}
