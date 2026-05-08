import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasUsers = await knex.schema.hasTable('users');

  if (!hasOrganizations || !hasUsers) {
    throw new Error('Required tables not found (organizations/users). Run previous migrations first.');
  }

  const hasChartAccounts = await knex.schema.hasTable('accounting_chart_accounts');
  if (!hasChartAccounts) {
    await knex.schema.createTable('accounting_chart_accounts', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.string('code', 40).notNullable();
      table.string('name', 255).notNullable();
      table.enu('account_type', ['asset', 'liability', 'equity', 'revenue', 'expense']).notNullable();
      table.enu('normal_balance', ['debit', 'credit']).notNullable();
      table.uuid('parent_id').nullable().references('id').inTable('accounting_chart_accounts').onDelete('RESTRICT');
      table.integer('level').notNullable().defaultTo(1);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.boolean('allows_posting').notNullable().defaultTo(true);
      table.text('description').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('reference_type', 100).nullable();
      table.uuid('reference_id').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.index(['organization_id', 'parent_id']);
      table.index(['organization_id', 'account_type']);
    });
  }

  const hasFinanceTransactions = await knex.schema.hasTable('finance_transactions');
  if (!hasFinanceTransactions) {
    await knex.schema.createTable('finance_transactions', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.enu('transaction_type', ['receivable', 'payable', 'treasury', 'journal_adjustment', 'transfer', 'payment', 'receipt']).notNullable();
      table.enu('status', ['draft', 'posted', 'cancelled', 'reversed']).notNullable().defaultTo('draft');
      table.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.string('currency', 3).notNullable().defaultTo('BRL');
      table.decimal('amount', 18, 2).notNullable();
      table.text('description').nullable();
      table.string('reference_type', 100).nullable();
      table.uuid('reference_id').nullable();
      table.uuid('reversed_transaction_id').nullable().references('id').inTable('finance_transactions').onDelete('SET NULL');
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('posted_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'occurred_at']);
      table.index(['organization_id', 'transaction_type']);
      table.index(['reference_type', 'reference_id']);
    });
  }

  const hasJournalEntries = await knex.schema.hasTable('accounting_journal_entries');
  if (!hasJournalEntries) {
    await knex.schema.createTable('accounting_journal_entries', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('transaction_id').nullable().references('id').inTable('finance_transactions').onDelete('SET NULL');
      table.enu('status', ['draft', 'posted', 'reversed']).notNullable().defaultTo('posted');
      table.timestamp('entry_date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.text('description').notNullable();
      table.string('reference_type', 100).nullable();
      table.uuid('reference_id').nullable();
      table.uuid('reversal_of_entry_id').nullable().references('id').inTable('accounting_journal_entries').onDelete('SET NULL');
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('posted_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('posted_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'entry_date']);
      table.index(['organization_id', 'status']);
      table.index(['transaction_id']);
      table.index(['reference_type', 'reference_id']);
    });
  }

  const hasJournalLines = await knex.schema.hasTable('accounting_journal_entry_lines');
  if (!hasJournalLines) {
    await knex.schema.createTable('accounting_journal_entry_lines', (table) => {
      table.uuid('id').primary();
      table.uuid('journal_entry_id').notNullable().references('id').inTable('accounting_journal_entries').onDelete('CASCADE');
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('account_id').notNullable().references('id').inTable('accounting_chart_accounts').onDelete('RESTRICT');
      table.enu('line_type', ['debit', 'credit']).notNullable();
      table.decimal('amount', 18, 2).notNullable();
      table.text('memo').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('reference_type', 100).nullable();
      table.uuid('reference_id').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['journal_entry_id']);
      table.index(['organization_id', 'account_id']);
      table.index(['organization_id', 'line_type']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('accounting_journal_entry_lines');
  await knex.schema.dropTableIfExists('accounting_journal_entries');
  await knex.schema.dropTableIfExists('finance_transactions');
  await knex.schema.dropTableIfExists('accounting_chart_accounts');
}
