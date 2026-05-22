import type { Knex } from 'knex';

/**
 * Fase 4a — Faturamento Recorrente (Billing).
 *
 *  - `billing_plans`: catálogo de planos de assinatura (mensal/anual/etc).
 *  - `billing_subscriptions`: contrato cliente↔plano com ciclo, valor,
 *    período atual e próxima cobrança.
 *  - `billing_subscription_invoices`: rastreio idempotente das faturas
 *    geradas a partir das assinaturas (unique por período).
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('customers'))) {
    throw new Error('customers não encontrada');
  }

  // ─── PLANS ────────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('billing_plans'))) {
    await knex.schema.createTable('billing_plans', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('code', 40).notNullable();
      table.string('name', 180).notNullable();
      table.text('description').nullable();

      // Valor do plano (por unidade)
      table.decimal('amount', 18, 4).notNullable();
      table.string('currency', 3).notNullable().defaultTo('BRL');

      // 'monthly' | 'quarterly' | 'semiannual' | 'annual'
      table.string('billing_cycle', 20).notNullable().defaultTo('monthly');

      // Dias de teste antes de começar a cobrança (0 = sem trial)
      table.integer('trial_days').notNullable().defaultTo(0);

      // Produto vinculado (gera linha de fatura) — opcional
      table.uuid('product_id').nullable().references('id').inTable('sales_products').onDelete('SET NULL');
      table.uuid('default_tax_rate_id').nullable().references('id').inTable('tax_rates').onDelete('SET NULL');

      table.boolean('is_active').notNullable().defaultTo(true);

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.index(['organization_id', 'is_active']);
    });
  }

  // ─── SUBSCRIPTIONS ────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('billing_subscriptions'))) {
    await knex.schema.createTable('billing_subscriptions', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table
        .uuid('customer_id')
        .notNullable()
        .references('id')
        .inTable('customers')
        .onDelete('RESTRICT');
      table
        .uuid('plan_id')
        .nullable()
        .references('id')
        .inTable('billing_plans')
        .onDelete('SET NULL');

      /**
       * Estados:
       *  trialing       — em período de teste (não cobra)
       *  active         — ativa, gera fatura a cada ciclo
       *  past_due       — fatura gerada mas não paga após X dias (manual)
       *  paused         — pausada manualmente (não gera fatura)
       *  cancelled      — encerrada (terminal)
       */
      table.string('status', 20).notNullable().defaultTo('active');

      table.date('start_date').notNullable();
      table.date('trial_end_date').nullable();

      // Período corrente (atualizado a cada cobrança)
      table.date('current_period_start').notNullable();
      table.date('current_period_end').notNullable();
      // Quando a próxima fatura será gerada
      table.date('next_billing_date').notNullable();

      // Snapshots do plano no momento da contratação — permitem alterar plano
      // sem afetar histórico, e o cliente "trava" no preço acordado.
      table.string('billing_cycle', 20).notNullable();
      table.decimal('amount', 18, 4).notNullable();
      table.string('currency', 3).notNullable();
      table.decimal('quantity', 18, 4).notNullable().defaultTo(1);

      // Desconto fixo aplicado a cada ciclo (R$)
      table.decimal('discount_amount', 18, 4).notNullable().defaultTo(0);

      table.date('cancellation_date').nullable();
      table.text('cancellation_reason').nullable();
      table.text('notes').nullable();

      table.uuid('assigned_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'next_billing_date']);
      table.index(['organization_id', 'customer_id']);
    });
  }

  // ─── RASTREIO DE FATURAS GERADAS ──────────────────────────────────────
  if (!(await knex.schema.hasTable('billing_subscription_invoices'))) {
    await knex.schema.createTable('billing_subscription_invoices', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('subscription_id')
        .notNullable()
        .references('id')
        .inTable('billing_subscriptions')
        .onDelete('CASCADE');
      table
        .uuid('sales_document_id')
        .nullable()
        .references('id')
        .inTable('sales_documents')
        .onDelete('SET NULL');

      table.date('period_start').notNullable();
      table.date('period_end').notNullable();
      table.decimal('amount', 18, 4).notNullable();
      // 'generated' | 'failed' | 'skipped'
      table.string('status', 20).notNullable().defaultTo('generated');
      table.text('detail').nullable();

      table.timestamp('generated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Idempotência: cada (assinatura, período) gera uma única fatura
      table.unique(['subscription_id', 'period_start']);
      table.index(['organization_id', 'generated_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('billing_subscription_invoices');
  await knex.schema.dropTableIfExists('billing_subscriptions');
  await knex.schema.dropTableIfExists('billing_plans');
}
