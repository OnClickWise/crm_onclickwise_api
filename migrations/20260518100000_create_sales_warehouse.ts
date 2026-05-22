import type { Knex } from 'knex';

/**
 * Módulo de armazém/separação dentro de Vendas:
 *
 *  - `sales_stock_reservations`: reserva lógica de stock quando um pedido é
 *    aceito. Stock disponível = stock_qty - SUM(reservations ativas). Evita
 *    overselling entre vendedores.
 *
 *  - `sales_fulfillments`: pedido de separação ("Picking List"). Gerado
 *    automaticamente quando uma encomenda (order) é aceita. Tem fluxo próprio
 *    de status independente do documento comercial.
 *
 *  - `sales_fulfillment_items`: linhas a serem separadas (qty requested vs
 *    picked). Suporta lote/série, status por linha (picked/partial/missing/
 *    damaged) e auditoria de quem separou.
 *
 *  - `sales_documents.stock_committed`: flag idempotente — uma vez que o stock
 *    foi decrementado (seja via expedição de fulfillment ou via faturamento
 *    direto), não decrementa de novo.
 *
 *  - `sales_fulfillment_numbering`: contador atômico igual ao de documentos.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('sales_documents'))) {
    throw new Error('sales_documents não encontrada — rode migration de vendas primeiro');
  }

  // Idempotência do decremento de stock
  if (!(await knex.schema.hasColumn('sales_documents', 'stock_committed'))) {
    await knex.schema.alterTable('sales_documents', (table) => {
      table.boolean('stock_committed').notNullable().defaultTo(false);
      table.timestamp('stock_committed_at', { useTz: true }).nullable();
    });
  }

  // ─── STOCK RESERVATIONS ─────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('sales_stock_reservations'))) {
    await knex.schema.createTable('sales_stock_reservations', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('product_id')
        .notNullable()
        .references('id')
        .inTable('sales_products')
        .onDelete('CASCADE');

      // Origem da reserva: 'sales_order' (encomenda) | 'manual' (admin reservou)
      table.string('reference_type', 30).notNullable();
      table.uuid('reference_id').nullable();

      table.decimal('quantity', 18, 4).notNullable();

      // 'active' | 'consumed' (virou venda real) | 'released' (cancelado) | 'expired'
      table.string('status', 20).notNullable().defaultTo('active');

      table.timestamp('expires_at', { useTz: true }).nullable();
      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('consumed_at', { useTz: true }).nullable();
      table.timestamp('released_at', { useTz: true }).nullable();

      table.index(['organization_id', 'product_id', 'status']);
      table.index(['organization_id', 'reference_type', 'reference_id']);
    });
  }

  // ─── FULFILLMENT NUMBERING ──────────────────────────────────────────────
  if (!(await knex.schema.hasTable('sales_fulfillment_numbering'))) {
    await knex.schema.createTable('sales_fulfillment_numbering', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table.string('prefix', 10).notNullable().defaultTo('SEP');
      table.integer('year').notNullable();
      table.integer('last_number').notNullable().defaultTo(0);
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'year']);
    });
  }

  // ─── FULFILLMENTS ───────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('sales_fulfillments'))) {
    await knex.schema.createTable('sales_fulfillments', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('order_id')
        .notNullable()
        .references('id')
        .inTable('sales_documents')
        .onDelete('CASCADE');

      // "SEP-2026-0042"
      table.string('fulfillment_number', 40).notNullable();

      // Estado da separação:
      //   pending     — aguardando atribuição
      //   assigned    — operador atribuído, ainda não começou
      //   picking     — em separação
      //   picked      — todos itens separados
      //   packed      — embalado
      //   shipped     — expedido (decrementa stock + libera reserva)
      //   delivered   — confirmação de entrega ao cliente
      //   cancelled   — cancelado, libera reservas
      table.string('status', 20).notNullable().defaultTo('pending');

      // Prioridade visual na fila
      table.string('priority', 10).notNullable().defaultTo('normal'); // low|normal|high|urgent

      // Operador responsável
      table.uuid('assigned_to_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      // Localização opcional (Depósito A, Sala 3...)
      table.string('warehouse_location', 120).nullable();

      // Expedição
      table.string('carrier', 120).nullable();
      table.string('tracking_number', 120).nullable();
      table.decimal('weight_kg', 12, 3).nullable();
      table.integer('package_count').nullable();

      // Documento de remessa gerado a partir do fulfillment (opcional)
      table.uuid('delivery_doc_id').nullable().references('id').inTable('sales_documents').onDelete('SET NULL');

      table.text('notes').nullable();
      table.text('internal_notes').nullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('assigned_at', { useTz: true }).nullable();
      table.timestamp('started_at', { useTz: true }).nullable();
      table.timestamp('picked_at', { useTz: true }).nullable();
      table.timestamp('packed_at', { useTz: true }).nullable();
      table.timestamp('shipped_at', { useTz: true }).nullable();
      table.timestamp('delivered_at', { useTz: true }).nullable();
      table.timestamp('cancelled_at', { useTz: true }).nullable();

      table.unique(['organization_id', 'fulfillment_number']);
      // Um pedido tem 1 fulfillment ativo. Permitimos múltiplos (split shipment futuro),
      // mas garantimos pelo menos índice rápido.
      table.index(['organization_id', 'order_id']);
      table.index(['organization_id', 'status', 'priority']);
      table.index(['assigned_to_user_id', 'status']);
    });
  }

  // ─── FULFILLMENT ITEMS ──────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('sales_fulfillment_items'))) {
    await knex.schema.createTable('sales_fulfillment_items', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('fulfillment_id')
        .notNullable()
        .references('id')
        .inTable('sales_fulfillments')
        .onDelete('CASCADE');

      // Referência à linha original da encomenda (rastreabilidade)
      table.uuid('order_line_id').nullable().references('id').inTable('sales_document_lines').onDelete('SET NULL');
      table.uuid('product_id').nullable().references('id').inTable('sales_products').onDelete('SET NULL');

      // Snapshot do produto no momento da separação (caso o produto seja deletado)
      table.string('product_code', 60).nullable();
      table.string('description', 500).notNullable();
      table.string('unit', 20).notNullable().defaultTo('un');

      table.decimal('quantity_requested', 18, 4).notNullable();
      table.decimal('quantity_picked', 18, 4).notNullable().defaultTo(0);

      // 'pending' | 'picked' (qty = requested) | 'partial' (qty < requested) |
      // 'missing' (não encontrado) | 'damaged' (encontrado mas danificado)
      table.string('status', 20).notNullable().defaultTo('pending');

      // Rastreabilidade
      table.string('lot_number', 120).nullable();
      table.string('serial_number', 120).nullable();
      table.string('bin_location', 120).nullable(); // ex.: "A3-04"

      table.text('notes').nullable();
      table.uuid('picked_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('picked_at', { useTz: true }).nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'fulfillment_id']);
      table.index(['product_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sales_fulfillment_items');
  await knex.schema.dropTableIfExists('sales_fulfillments');
  await knex.schema.dropTableIfExists('sales_fulfillment_numbering');
  await knex.schema.dropTableIfExists('sales_stock_reservations');
  if (await knex.schema.hasColumn('sales_documents', 'stock_committed')) {
    await knex.schema.alterTable('sales_documents', (table) => {
      table.dropColumn('stock_committed_at');
      table.dropColumn('stock_committed');
    });
  }
}
