import type { Knex } from 'knex';

/**
 * Módulo de Compras (Procure-to-Pay, P2P).
 * Simétrico ao módulo de Vendas, mas no sentido inverso:
 *  - Documentos: request → order → receipt → invoice → credit_note / return
 *  - Stock: entra no momento de `receipt` (Recepção) OU em `invoice` direto
 *  - AP: gerada quando `invoice` é confirmada
 *
 * Tipos:
 *  - 'request'      : Pedido de Cotação (RFQ) — mando pro fornecedor cotar
 *  - 'order'        : Ordem de Compra (PO) — comprometimento de compra
 *  - 'receipt'      : Recepção / Nota de Entrada — produto chegou ao armazém
 *  - 'invoice'      : Fatura do Fornecedor — gera AP
 *  - 'credit_note'  : NC recebida do fornecedor — abate AP
 *  - 'return'       : Devolução ao Fornecedor — saída de stock + AR contra fornecedor
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('suppliers'))) {
    throw new Error('suppliers não encontrada — rode migration de finance primeiro');
  }

  // ─── PURCHASE DOCUMENT NUMBERING (séries) ───────────────────────────────
  if (!(await knex.schema.hasTable('purchase_document_numbering'))) {
    await knex.schema.createTable('purchase_document_numbering', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table.string('doc_type', 20).notNullable();
      table.string('prefix', 10).notNullable();
      table.integer('year').notNullable();
      table.integer('last_number').notNullable().defaultTo(0);
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.unique(['organization_id', 'doc_type', 'year']);
    });
  }

  // ─── PURCHASE DOCUMENTS ────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('purchase_documents'))) {
    await knex.schema.createTable('purchase_documents', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('doc_number', 40).notNullable(); // PC-2026-0001, NE-2026-0042
      table.string('doc_type', 20).notNullable();

      /**
       * Estados:
       *  draft       — em edição
       *  sent        — enviado ao fornecedor (request/order)
       *  accepted    — fornecedor aceitou (order)
       *  received    — produtos recebidos (receipt) → stock entrou
       *  invoiced    — fatura registrada → AP criada
       *  paid        — AP totalmente quitada
       *  partially_paid
       *  cancelled
       *  rejected    — fornecedor rejeitou (request)
       */
      table.string('status', 20).notNullable().defaultTo('draft');

      table
        .uuid('supplier_id')
        .notNullable()
        .references('id')
        .inTable('suppliers')
        .onDelete('RESTRICT');

      // Referência ao documento externo do fornecedor (fatura nº, NF-e, etc.)
      table.string('supplier_doc_number', 60).nullable();
      table.date('supplier_doc_date').nullable();

      table.date('issue_date').notNullable();
      table.date('expected_delivery_date').nullable();
      table.date('due_date').nullable();

      // Multi-moeda — moeda do fornecedor (USD, EUR…)
      table.string('currency', 3).notNullable().defaultTo('BRL');
      table.decimal('exchange_rate', 18, 8).notNullable().defaultTo(1);

      table.decimal('subtotal', 18, 4).notNullable().defaultTo(0);
      table.decimal('total_discount', 18, 4).notNullable().defaultTo(0);
      table.decimal('total_tax', 18, 4).notNullable().defaultTo(0);
      table.decimal('total', 18, 4).notNullable().defaultTo(0);
      // Total pago (atualizado pelo módulo AP)
      table.decimal('amount_paid', 18, 4).notNullable().defaultTo(0);

      // Retenção na fonte (Angola IRT, Brasil IRRF/CSLL/COFINS)
      table.decimal('withholding_amount', 18, 4).notNullable().defaultTo(0);

      // Lineage: order → receipt → invoice
      table.uuid('converted_from_id').nullable().references('id').inTable('purchase_documents').onDelete('SET NULL');

      // Stock idempotência (igual ao sales_documents)
      table.boolean('stock_committed').notNullable().defaultTo(false);
      table.timestamp('stock_committed_at', { useTz: true }).nullable();

      // Armazém onde a mercadoria entrou (default = padrão da org)
      table.uuid('warehouse_id').nullable().references('id').inTable('stock_warehouses').onDelete('SET NULL');

      table.text('notes').nullable();
      table.text('terms').nullable();
      table.string('payment_method', 30).nullable();

      // Aprovação (reusa ApprovalsModule)
      table.string('approval_status', 20).notNullable().defaultTo('not_required');
      table.uuid('approval_request_id').nullable();

      table.uuid('assigned_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('received_at', { useTz: true }).nullable();
      table.timestamp('invoiced_at', { useTz: true }).nullable();
      table.timestamp('cancelled_at', { useTz: true }).nullable();

      table.unique(['organization_id', 'doc_number']);
      table.index(['organization_id', 'doc_type', 'status']);
      table.index(['organization_id', 'supplier_id']);
      table.index(['organization_id', 'issue_date']);
    });
  }

  // ─── PURCHASE DOCUMENT LINES ───────────────────────────────────────────
  if (!(await knex.schema.hasTable('purchase_document_lines'))) {
    await knex.schema.createTable('purchase_document_lines', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('document_id')
        .notNullable()
        .references('id')
        .inTable('purchase_documents')
        .onDelete('CASCADE');

      table.integer('line_order').notNullable();

      // Produto opcional (permite serviços avulsos, frete, etc.)
      table.uuid('product_id').nullable().references('id').inTable('sales_products').onDelete('SET NULL');
      table.string('product_code', 60).nullable(); // snapshot
      table.string('description', 500).notNullable();
      table.string('unit', 20).notNullable().defaultTo('un');

      table.decimal('quantity', 18, 4).notNullable().defaultTo(1);
      // Em recepções, quantidade efetivamente recebida (pode ser < quantity pedida)
      table.decimal('quantity_received', 18, 4).notNullable().defaultTo(0);
      table.decimal('unit_cost', 18, 4).notNullable().defaultTo(0);
      table.decimal('discount_pct', 6, 3).notNullable().defaultTo(0);

      table.uuid('tax_rate_id').nullable().references('id').inTable('tax_rates').onDelete('SET NULL');
      table.decimal('tax_rate_pct', 6, 3).notNullable().defaultTo(0);

      // Calculados
      table.decimal('subtotal', 18, 4).notNullable().defaultTo(0);
      table.decimal('discount_amount', 18, 4).notNullable().defaultTo(0);
      table.decimal('tax_amount', 18, 4).notNullable().defaultTo(0);
      table.decimal('line_total', 18, 4).notNullable().defaultTo(0);

      // Rastreabilidade
      table.string('lot_number', 120).nullable();
      table.string('serial_number', 120).nullable();

      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'document_id']);
      table.unique(['document_id', 'line_order']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('purchase_document_lines');
  await knex.schema.dropTableIfExists('purchase_documents');
  await knex.schema.dropTableIfExists('purchase_document_numbering');
}
