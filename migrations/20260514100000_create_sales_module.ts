import type { Knex } from 'knex';

/**
 * Módulo de Vendas (Primavera-inspired):
 *
 *  - sales_products: catálogo de artigos/serviços (SKU, preço, IVA, stock).
 *  - sales_price_lists + sales_price_list_items: tabelas de preços (ex.: "Atacado",
 *    "VIP") com preços específicos por produto.
 *  - sales_documents + sales_document_lines: documentos de venda multi-tipo
 *    (orçamento, encomenda, guia de remessa, fatura, nota de crédito).
 *  - sales_document_numbering: gera números sequenciais por tipo de documento e ano
 *    (ex.: ORC-2026-0001, FAT-2026-0042). Concorrência via SELECT ... FOR UPDATE.
 *  - sales_commissions: cálculo de comissão por vendedor após documento ser
 *    faturado.
 *
 * Rastreabilidade da conversão entre tipos:
 *  Orçamento → Encomenda → Guia de Remessa → Fatura.
 *  Cada documento aponta para o anterior via converted_from_id.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('organizations'))) {
    throw new Error('organizations não encontrada');
  }
  if (!(await knex.schema.hasTable('customers'))) {
    throw new Error('customers não encontrada — rode migrations finance primeiro');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SALES_PRODUCTS — catálogo de artigos e serviços
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('sales_products'))) {
    await knex.schema.createTable('sales_products', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('code', 60).notNullable(); // SKU
      table.string('name', 255).notNullable();
      table.text('description').nullable();
      table.string('barcode', 60).nullable();

      // 'product' | 'service'
      table.string('product_type', 20).notNullable().defaultTo('product');

      // Unidade: 'un', 'hr', 'kg', 'm', 'l'...
      table.string('unit', 20).notNullable().defaultTo('un');

      // Preços e custo (sem imposto)
      table.decimal('price_sale', 18, 4).notNullable().defaultTo(0);
      table.decimal('price_cost', 18, 4).notNullable().defaultTo(0);
      table.string('currency', 3).notNullable().defaultTo('BRL');

      // Imposto padrão aplicado nas linhas (nullable = sem imposto / definir na linha)
      table.uuid('default_tax_rate_id').nullable().references('id').inTable('tax_rates').onDelete('SET NULL');

      // Categorização
      table.string('category', 80).nullable();
      table.string('brand', 80).nullable();

      // Stock (apenas se product_type='product')
      table.boolean('stock_track').notNullable().defaultTo(false);
      table.decimal('stock_qty', 18, 4).notNullable().defaultTo(0);
      table.decimal('stock_min', 18, 4).notNullable().defaultTo(0);

      table.boolean('is_active').notNullable().defaultTo(true);
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.index(['organization_id', 'is_active']);
      table.index(['organization_id', 'product_type']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SALES_PRICE_LISTS — tabelas de preços (Atacado, VIP, Promo Q2...)
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('sales_price_lists'))) {
    await knex.schema.createTable('sales_price_lists', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table.string('name', 120).notNullable();
      table.text('description').nullable();
      table.string('currency', 3).notNullable().defaultTo('BRL');
      table.boolean('is_default').notNullable().defaultTo(false);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.date('valid_from').nullable();
      table.date('valid_to').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'name']);
      table.index(['organization_id', 'is_active']);
    });
  }

  if (!(await knex.schema.hasTable('sales_price_list_items'))) {
    await knex.schema.createTable('sales_price_list_items', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table
        .uuid('price_list_id')
        .notNullable()
        .references('id')
        .inTable('sales_price_lists')
        .onDelete('CASCADE');
      table
        .uuid('product_id')
        .notNullable()
        .references('id')
        .inTable('sales_products')
        .onDelete('CASCADE');
      table.decimal('price', 18, 4).notNullable();
      table.decimal('discount_pct', 6, 3).notNullable().defaultTo(0);
      // Quantidade mínima para esse preço aplicar (ex.: atacado a partir de 10un)
      table.decimal('min_quantity', 18, 4).notNullable().defaultTo(1);
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['price_list_id', 'product_id', 'min_quantity']);
      table.index(['organization_id', 'product_id']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SALES_DOCUMENT_NUMBERING — gera números sequenciais por tipo+ano
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('sales_document_numbering'))) {
    await knex.schema.createTable('sales_document_numbering', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      // 'quote' | 'order' | 'delivery' | 'invoice' | 'credit_note'
      table.string('doc_type', 20).notNullable();
      // Prefixo (ORC, ENC, GR, FAT, NC). Pode ser custom por org.
      table.string('prefix', 10).notNullable();
      table.integer('year').notNullable();
      table.integer('last_number').notNullable().defaultTo(0);
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'doc_type', 'year']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SALES_DOCUMENTS
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('sales_documents'))) {
    await knex.schema.createTable('sales_documents', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Número formatado: "ORC-2026-0001"
      table.string('doc_number', 40).notNullable();
      table.string('doc_type', 20).notNullable(); // quote|order|delivery|invoice|credit_note

      // 'draft' | 'sent' | 'accepted' | 'rejected' | 'invoiced' | 'paid' |
      // 'partially_paid' | 'cancelled'
      table.string('status', 20).notNullable().defaultTo('draft');

      table.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('RESTRICT');
      table.uuid('price_list_id').nullable().references('id').inTable('sales_price_lists').onDelete('SET NULL');

      table.date('issue_date').notNullable();
      table.date('due_date').nullable();
      table.date('valid_until').nullable(); // p/ orçamentos

      // Moeda do documento + taxa de conversão p/ moeda da org no momento da emissão
      table.string('currency', 3).notNullable().defaultTo('BRL');
      table.decimal('exchange_rate', 18, 8).notNullable().defaultTo(1);

      // Totais — calculados a partir das linhas
      table.decimal('subtotal', 18, 4).notNullable().defaultTo(0);
      table.decimal('total_discount', 18, 4).notNullable().defaultTo(0);
      table.decimal('total_tax', 18, 4).notNullable().defaultTo(0);
      table.decimal('total', 18, 4).notNullable().defaultTo(0);
      // Quanto já foi pago (atualizado por integração com Receivables)
      table.decimal('amount_paid', 18, 4).notNullable().defaultTo(0);

      // Lineage: documento de origem (orçamento → encomenda → fatura)
      table.uuid('converted_from_id').nullable().references('id').inTable('sales_documents').onDelete('SET NULL');

      table.text('notes').nullable();
      table.text('terms').nullable();
      table.string('payment_method', 30).nullable();

      table.uuid('assigned_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('issued_at', { useTz: true }).nullable();
      table.timestamp('cancelled_at', { useTz: true }).nullable();

      table.unique(['organization_id', 'doc_number']);
      table.index(['organization_id', 'doc_type', 'status']);
      table.index(['organization_id', 'customer_id']);
      table.index(['organization_id', 'issue_date']);
      table.index(['assigned_user_id']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SALES_DOCUMENT_LINES
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('sales_document_lines'))) {
    await knex.schema.createTable('sales_document_lines', (table) => {
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
        .inTable('sales_documents')
        .onDelete('CASCADE');

      table.integer('line_order').notNullable();

      // product_id é opcional — permite linhas free-text (consultoria avulsa, frete...)
      table.uuid('product_id').nullable().references('id').inTable('sales_products').onDelete('SET NULL');
      table.string('product_code', 60).nullable(); // snapshot
      table.string('description', 500).notNullable();
      table.string('unit', 20).notNullable().defaultTo('un');

      table.decimal('quantity', 18, 4).notNullable().defaultTo(1);
      table.decimal('unit_price', 18, 4).notNullable().defaultTo(0);
      table.decimal('discount_pct', 6, 3).notNullable().defaultTo(0);

      // Imposto: snapshot do tax_rate no momento (taxa pode mudar depois)
      table.uuid('tax_rate_id').nullable().references('id').inTable('tax_rates').onDelete('SET NULL');
      table.decimal('tax_rate_pct', 6, 3).notNullable().defaultTo(0);

      // Calculados:
      // subtotal = quantity * unit_price
      // discount_amount = subtotal * discount_pct/100
      // taxable = subtotal - discount_amount
      // tax_amount = taxable * tax_rate_pct/100
      // line_total = taxable + tax_amount
      table.decimal('subtotal', 18, 4).notNullable().defaultTo(0);
      table.decimal('discount_amount', 18, 4).notNullable().defaultTo(0);
      table.decimal('tax_amount', 18, 4).notNullable().defaultTo(0);
      table.decimal('line_total', 18, 4).notNullable().defaultTo(0);

      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'document_id']);
      table.unique(['document_id', 'line_order']);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SALES_COMMISSIONS — comissão por vendedor sobre documento faturado
  // ═══════════════════════════════════════════════════════════════════════
  if (!(await knex.schema.hasTable('sales_commissions'))) {
    await knex.schema.createTable('sales_commissions', (table) => {
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
        .inTable('sales_documents')
        .onDelete('CASCADE');
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');

      // Base de cálculo (subtotal sem imposto, ou total — configurável por regra futura)
      table.decimal('base_amount', 18, 4).notNullable();
      table.decimal('commission_pct', 6, 3).notNullable();
      table.decimal('commission_amount', 18, 4).notNullable();
      table.string('currency', 3).notNullable().defaultTo('BRL');

      // 'pending' (faturado mas não pago) | 'eligible' (cliente pagou, comissão devida)
      // | 'paid' (já paga ao vendedor) | 'cancelled' (doc cancelado/devolvido)
      table.string('status', 20).notNullable().defaultTo('pending');
      table.text('notes').nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('paid_at', { useTz: true }).nullable();

      table.unique(['document_id', 'user_id']);
      table.index(['organization_id', 'user_id', 'status']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sales_commissions');
  await knex.schema.dropTableIfExists('sales_document_lines');
  await knex.schema.dropTableIfExists('sales_documents');
  await knex.schema.dropTableIfExists('sales_document_numbering');
  await knex.schema.dropTableIfExists('sales_price_list_items');
  await knex.schema.dropTableIfExists('sales_price_lists');
  await knex.schema.dropTableIfExists('sales_products');
}
