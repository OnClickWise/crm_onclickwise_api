import type { Knex } from 'knex';

/**
 * Lançamentos Contábeis Automáticos.
 *
 * Conecta os módulos operacionais (Vendas, Compras, Inventário) à
 * Contabilidade. Quando um evento de negócio ocorre (fatura emitida,
 * compra recebida, etc.), o sistema gera automaticamente o lançamento
 * de partida dobrada conforme as REGRAS configuradas pela organização.
 *
 *  - `accounting_journal_rules`: 1 regra por (org, event_type). Define o
 *    "template" do lançamento para aquele evento.
 *
 *  - `accounting_journal_rule_lines`: as linhas D/C do template. Cada linha
 *    aponta para uma conta do plano de contas + uma FONTE DE VALOR
 *    (`amount_source`) que diz QUAL número do documento usar:
 *      total, subtotal, tax, discount, withholding, cogs, payment_amount.
 *
 *  Ao gerar o lançamento, o AutoJournalService substitui cada amount_source
 *  pelo valor real do documento. Se a soma de débitos ≠ créditos, ou se
 *  alguma conta não está mapeada, o lançamento é criado como `draft` para
 *  revisão manual — NUNCA bloqueia a operação de negócio.
 *
 *  Os lançamentos gerados ficam vinculados via (reference_type, reference_id)
 *  para garantir idempotência (não duplicar) e rastreabilidade.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('accounting_chart_accounts'))) {
    throw new Error('accounting_chart_accounts não encontrada — rode migrations de contabilidade primeiro');
  }

  // ─── REGRAS ────────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('accounting_journal_rules'))) {
    await knex.schema.createTable('accounting_journal_rules', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      /**
       * Eventos de negócio suportados:
       *  sales_invoice         — Fatura de venda emitida
       *  sales_credit_note     — Nota de crédito de venda
       *  sales_cogs            — Custo da Mercadoria Vendida (baixa de estoque na venda)
       *  purchase_invoice      — Fatura de compra registrada
       *  purchase_credit_note  — NC de compra
       *  purchase_receipt      — Recepção de mercadoria (entrada de estoque)
       *  stock_adjustment_in   — Ajuste positivo de inventário
       *  stock_adjustment_out  — Ajuste negativo de inventário (perda/quebra)
       *  sales_payment         — Recebimento de cliente
       *  purchase_payment      — Pagamento a fornecedor
       */
      table.string('event_type', 40).notNullable();
      table.string('name', 180).notNullable();
      table.text('description').nullable();
      table.boolean('is_active').notNullable().defaultTo(true);

      // Se true, o lançamento gerado já nasce 'posted'. Se false, nasce 'draft'
      // e exige revisão/postagem manual de um contador.
      table.boolean('auto_post').notNullable().defaultTo(true);

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'event_type']);
      table.index(['organization_id', 'is_active']);
    });
  }

  // ─── LINHAS DA REGRA ───────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('accounting_journal_rule_lines'))) {
    await knex.schema.createTable('accounting_journal_rule_lines', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('rule_id')
        .notNullable()
        .references('id')
        .inTable('accounting_journal_rules')
        .onDelete('CASCADE');

      table.enu('line_type', ['debit', 'credit']).notNullable();

      // Conta do plano de contas. Nullable: regra pode estar incompleta
      // (criada pelo seed mas ainda não mapeada pelo contador).
      table
        .uuid('account_id')
        .nullable()
        .references('id')
        .inTable('accounting_chart_accounts')
        .onDelete('RESTRICT');

      /**
       * De onde vem o valor desta linha:
       *  total          — valor total do documento (com imposto)
       *  subtotal       — valor líquido (sem imposto, sem desconto)
       *  tax            — total de impostos
       *  discount       — total de descontos
       *  withholding    — retenção na fonte
       *  cogs           — custo da mercadoria vendida (do inventário)
       *  payment_amount — valor de um pagamento/recebimento
       *  net_total      — total - retenção
       */
      table.string('amount_source', 30).notNullable();

      table.integer('sort_order').notNullable().defaultTo(0);
      table.string('memo_template', 255).nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'rule_id']);
    });
  }

  // ─── MARCADOR no journal_entry ─────────────────────────────────────────
  // Identifica que o lançamento foi gerado automaticamente + por qual regra.
  if (!(await knex.schema.hasColumn('accounting_journal_entries', 'auto_generated'))) {
    await knex.schema.alterTable('accounting_journal_entries', (table) => {
      table.boolean('auto_generated').notNullable().defaultTo(false);
      table.uuid('source_rule_id').nullable();
      // Motivo caso o lançamento automático tenha nascido 'draft'
      table.string('auto_journal_warning', 255).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('accounting_journal_entries', 'auto_generated')) {
    await knex.schema.alterTable('accounting_journal_entries', (table) => {
      table.dropColumn('auto_journal_warning');
      table.dropColumn('source_rule_id');
      table.dropColumn('auto_generated');
    });
  }
  await knex.schema.dropTableIfExists('accounting_journal_rule_lines');
  await knex.schema.dropTableIfExists('accounting_journal_rules');
}
