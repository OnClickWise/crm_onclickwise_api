import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasUsers = await knex.schema.hasTable('users');

  if (!hasOrganizations || !hasUsers) {
    throw new Error('Required tables (organizations/users) not found. Run previous migrations first.');
  }

  // ============= ACCOUNTS RECEIVABLE =============
  const hasAccountsReceivable = await knex.schema.hasTable('accounts_receivable');
  if (!hasAccountsReceivable) {
    await knex.schema.createTable('accounts_receivable', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('customer_id').nullable();
      table.string('customer_name', 255).notNullable();
      table.decimal('original_amount', 18, 2).notNullable();
      table.decimal('paid_amount', 18, 2).notNullable().defaultTo(0);
      table.decimal('outstanding_amount', 18, 2).notNullable();
      table.timestamp('issue_date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('due_date', { useTz: true }).notNullable();
      table.enu('status', ['draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled']).notNullable().defaultTo('issued');
      table.text('description').nullable();
      table.string('reference_number', 100).nullable();
      table.string('reference_type', 100).nullable();
      table.uuid('reference_id').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'reference_number']);
      table.index(['organization_id', 'customer_id']);
      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'due_date']);
    });
  }

  // ============= RECEIVABLE PAYMENTS =============
  const hasReceivablePayments = await knex.schema.hasTable('receivable_payments');
  if (!hasReceivablePayments) {
    await knex.schema.createTable('receivable_payments', (table) => {
      table.uuid('id').primary();
      table.uuid('receivable_id').notNullable().references('id').inTable('accounts_receivable').onDelete('CASCADE');
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.decimal('amount', 18, 2).notNullable();
      table.timestamp('payment_date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.string('payment_method', 50).nullable();
      table.string('payment_reference', 100).nullable();
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['receivable_id']);
      table.index(['organization_id', 'payment_date']);
    });
  }

  // ============= ACCOUNTS PAYABLE =============
  const hasAccountsPayable = await knex.schema.hasTable('accounts_payable');
  if (!hasAccountsPayable) {
    await knex.schema.createTable('accounts_payable', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('supplier_id').nullable();
      table.string('supplier_name', 255).notNullable();
      table.decimal('original_amount', 18, 2).notNullable();
      table.decimal('paid_amount', 18, 2).notNullable().defaultTo(0);
      table.decimal('outstanding_amount', 18, 2).notNullable();
      table.timestamp('issue_date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('due_date', { useTz: true }).notNullable();
      table.enu('status', ['draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled']).notNullable().defaultTo('issued');
      table.text('description').nullable();
      table.string('reference_number', 100).nullable();
      table.string('reference_type', 100).nullable();
      table.uuid('reference_id').nullable();
      table.boolean('allows_partial_payment').notNullable().defaultTo(true);
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'reference_number']);
      table.index(['organization_id', 'supplier_id']);
      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'due_date']);
    });
  }

  // ============= PAYABLE PAYMENTS =============
  const hasPayablePayments = await knex.schema.hasTable('payable_payments');
  if (!hasPayablePayments) {
    await knex.schema.createTable('payable_payments', (table) => {
      table.uuid('id').primary();
      table.uuid('payable_id').notNullable().references('id').inTable('accounts_payable').onDelete('CASCADE');
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.decimal('amount', 18, 2).notNullable();
      table.timestamp('payment_date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.string('payment_method', 50).nullable();
      table.string('payment_reference', 100).nullable();
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['payable_id']);
      table.index(['organization_id', 'payment_date']);
    });
  }

  // ============= BANK ACCOUNTS (TREASURY) =============
  const hasBankAccounts = await knex.schema.hasTable('bank_accounts');
  if (!hasBankAccounts) {
    await knex.schema.createTable('bank_accounts', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.string('bank_code', 10).notNullable();
      table.string('bank_name', 255).notNullable();
      table.string('account_number', 50).notNullable();
      table.string('account_type', 50).notNullable();
      table.string('account_holder', 255).notNullable();
      table.decimal('current_balance', 18, 2).notNullable().defaultTo(0);
      table.decimal('available_balance', 18, 2).notNullable().defaultTo(0);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.string('currency', 3).notNullable().defaultTo('BRL');
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'bank_code', 'account_number']);
      table.index(['organization_id', 'is_active']);
    });
  }

  // ============= CASH POSITIONS (TREASURY) =============
  const hasCashPositions = await knex.schema.hasTable('cash_positions');
  if (!hasCashPositions) {
    await knex.schema.createTable('cash_positions', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('bank_account_id').references('id').inTable('bank_accounts').onDelete('CASCADE');
      table.date('position_date').notNullable();
      table.decimal('opening_balance', 18, 2).notNullable();
      table.decimal('inflows', 18, 2).notNullable().defaultTo(0);
      table.decimal('outflows', 18, 2).notNullable().defaultTo(0);
      table.decimal('closing_balance', 18, 2).notNullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'bank_account_id', 'position_date']);
      table.index(['organization_id', 'position_date']);
    });
  }

  // ============= BANK STATEMENTS =============
  const hasBankStatements = await knex.schema.hasTable('bank_statements');
  if (!hasBankStatements) {
    await knex.schema.createTable('bank_statements', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('bank_account_id').notNullable().references('id').inTable('bank_accounts').onDelete('CASCADE');
      table.date('statement_date').notNullable();
      table.date('start_date').notNullable();
      table.date('end_date').notNullable();
      table.decimal('opening_balance', 18, 2).notNullable();
      table.decimal('closing_balance', 18, 2).notNullable();
      table.enu('status', ['draft', 'uploaded', 'reconciled', 'approved']).notNullable().defaultTo('uploaded');
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'bank_account_id', 'statement_date']);
      table.index(['organization_id', 'status']);
    });
  }

  // ============= BANK STATEMENT LINES =============
  const hasBankStatementLines = await knex.schema.hasTable('bank_statement_lines');
  if (!hasBankStatementLines) {
    await knex.schema.createTable('bank_statement_lines', (table) => {
      table.uuid('id').primary();
      table.uuid('statement_id').notNullable().references('id').inTable('bank_statements').onDelete('CASCADE');
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.timestamp('transaction_date', { useTz: true }).notNullable();
      table.decimal('amount', 18, 2).notNullable();
      table.string('transaction_type', 50).notNullable();
      table.string('description', 500).notNullable();
      table.string('reference', 100).nullable();
      table.boolean('is_reconciled').notNullable().defaultTo(false);
      table.uuid('matched_transaction_id').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['statement_id']);
      table.index(['organization_id', 'is_reconciled']);
    });
  }

  // ============= BANK RECONCILIATION =============
  const hasBankReconciliation = await knex.schema.hasTable('bank_reconciliations');
  if (!hasBankReconciliation) {
    await knex.schema.createTable('bank_reconciliations', (table) => {
      table.uuid('id').primary();
      table.uuid('statement_id').notNullable().references('id').inTable('bank_statements').onDelete('CASCADE');
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('statement_line_id').references('id').inTable('bank_statement_lines').onDelete('CASCADE');
      table.uuid('finance_transaction_id').nullable();
      table.enu('match_status', ['matched', 'pending', 'discrepancy', 'unmatched']).notNullable().defaultTo('pending');
      table.decimal('variance_amount', 18, 2).defaultTo(0);
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['statement_id']);
      table.index(['organization_id', 'match_status']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bank_reconciliations');
  await knex.schema.dropTableIfExists('bank_statement_lines');
  await knex.schema.dropTableIfExists('bank_statements');
  await knex.schema.dropTableIfExists('cash_positions');
  await knex.schema.dropTableIfExists('bank_accounts');
  await knex.schema.dropTableIfExists('payable_payments');
  await knex.schema.dropTableIfExists('accounts_payable');
  await knex.schema.dropTableIfExists('receivable_payments');
  await knex.schema.dropTableIfExists('accounts_receivable');
}
