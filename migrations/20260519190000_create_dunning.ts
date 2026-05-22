import type { Knex } from 'knex';

/**
 * Fase 3c — Régua de Cobrança (Dunning).
 *
 *  - `dunning_rules`: passos da régua configuráveis por organização. Cada
 *    passo dispara num offset de dias relativo ao vencimento da conta a
 *    receber (negativo = antes; 0 = no dia; positivo = depois).
 *
 *  - `dunning_logs`: registro de cada e-mail de cobrança enviado. A chave
 *    única (organization_id, receivable_id, rule_id) garante que cada passo
 *    é disparado uma única vez por conta a receber (idempotência do cron).
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('accounts_receivable'))) {
    throw new Error('accounts_receivable não encontrada');
  }

  if (!(await knex.schema.hasTable('dunning_rules'))) {
    await knex.schema.createTable('dunning_rules', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('name', 180).notNullable();

      // Dias relativos ao vencimento: -3 = 3 dias antes; 0 = no dia; 15 = 15 dias depois
      table.integer('offset_days').notNullable();

      table.string('subject_template', 255).notNullable();
      table.text('body_template').notNullable();

      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('sort_order').notNullable().defaultTo(0);

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'is_active']);
    });
  }

  if (!(await knex.schema.hasTable('dunning_logs'))) {
    await knex.schema.createTable('dunning_logs', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('receivable_id')
        .notNullable()
        .references('id')
        .inTable('accounts_receivable')
        .onDelete('CASCADE');
      table
        .uuid('rule_id')
        .notNullable()
        .references('id')
        .inTable('dunning_rules')
        .onDelete('CASCADE');

      table.string('recipient_email', 255).notNullable();
      table.integer('days_from_due').notNullable();
      // 'sent' | 'failed' | 'skipped'
      table.string('status', 20).notNullable();
      table.text('detail').nullable();
      table.uuid('sent_email_id').nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Idempotência: cada passo só dispara uma vez por conta a receber
      table.unique(['organization_id', 'receivable_id', 'rule_id']);
      table.index(['organization_id', 'created_at']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dunning_logs');
  await knex.schema.dropTableIfExists('dunning_rules');
}
