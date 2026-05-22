import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

/**
 * Módulo de Inventário Avançado (Primavera-style, enterprise):
 *
 *  - `stock_warehouses`: múltiplos armazéns por organização (Depósito Central,
 *    Filial SP, Loja Loanda…). Um marcado como default.
 *
 *  - `stock_movements`: livro razão de stock — TODA alteração de quantidade
 *    é um movimento imutável. Tipos: 'in', 'out', 'transfer_in', 'transfer_out',
 *    'adjustment_positive', 'adjustment_negative', 'inventory_count'. Cada
 *    movimento referencia origem (sales_doc, purchase_doc, transfer, count).
 *    Rastreabilidade ISO 9001 garantida.
 *
 *  - `stock_warehouse_balances`: cache (product_id, warehouse_id) → quantity.
 *    Atualizado por trigger lógico no service (Knex não tem trigger SQL aqui).
 *
 *  - `stock_transfers`: documentos de transferência entre armazéns. Cada
 *    transferência gera 2 movimentos (transfer_out na origem, transfer_in no
 *    destino).
 *
 *  - `stock_inventory_counts` + items: contagem física cíclica. Operador conta,
 *    sistema gera ajustes automáticos baseado na diferença.
 *
 *  - sales_products.default_warehouse_id: o armazém usado quando não
 *    especificado em documento de venda/compra.
 *
 *  Estratégia de migração: o `sales_products.stock_qty` permanece como
 *  "balance total agregado" (sum balances), mantido pelo service. UI/clientes
 *  existentes continuam funcionando. Multi-armazém é opt-in.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('sales_products'))) {
    throw new Error('sales_products não encontrada — rode migrations de Vendas primeiro');
  }

  // ─── WAREHOUSES ────────────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('stock_warehouses'))) {
    await knex.schema.createTable('stock_warehouses', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('code', 40).notNullable(); // ARM-01, FILIAL-SP
      table.string('name', 180).notNullable();
      table.text('description').nullable();

      // Localização (opcional)
      table.string('address', 500).nullable();
      table.string('city', 120).nullable();
      table.string('country', 2).nullable();

      // Responsável
      table.uuid('manager_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');

      table.boolean('is_default').notNullable().defaultTo(false);
      table.boolean('is_active').notNullable().defaultTo(true);

      // 'physical' | 'virtual' (ex.: armazém de devolução, em trânsito, consignado)
      table.string('warehouse_type', 20).notNullable().defaultTo('physical');

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.index(['organization_id', 'is_active']);
    });
  }

  // Adiciona default_warehouse_id em products (opcional)
  if (!(await knex.schema.hasColumn('sales_products', 'default_warehouse_id'))) {
    await knex.schema.alterTable('sales_products', (table) => {
      table.uuid('default_warehouse_id').nullable();
    });
  }

  // ─── STOCK BALANCES (cache por product+warehouse) ──────────────────────
  if (!(await knex.schema.hasTable('stock_warehouse_balances'))) {
    await knex.schema.createTable('stock_warehouse_balances', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table.uuid('product_id').notNullable().references('id').inTable('sales_products').onDelete('CASCADE');
      table.uuid('warehouse_id').notNullable().references('id').inTable('stock_warehouses').onDelete('CASCADE');

      table.decimal('quantity', 18, 4).notNullable().defaultTo(0);

      // Custo médio ponderado por warehouse (valorização)
      table.decimal('avg_cost', 18, 4).notNullable().defaultTo(0);

      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['product_id', 'warehouse_id']);
      table.index(['organization_id', 'warehouse_id']);
    });
  }

  // ─── STOCK MOVEMENTS (livro razão imutável) ─────────────────────────────
  if (!(await knex.schema.hasTable('stock_movements'))) {
    await knex.schema.createTable('stock_movements', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table.uuid('product_id').notNullable().references('id').inTable('sales_products').onDelete('RESTRICT');
      table.uuid('warehouse_id').notNullable().references('id').inTable('stock_warehouses').onDelete('RESTRICT');

      /**
       * Tipos de movimento:
       *   in                   - entrada (compra, devolução cliente)
       *   out                  - saída (venda, consumo, devolução fornecedor)
       *   transfer_in          - entrada por transferência interna
       *   transfer_out         - saída por transferência interna
       *   adjustment_positive  - ajuste positivo (encontrei mais)
       *   adjustment_negative  - ajuste negativo (perda, quebra)
       *   inventory_count      - ajuste resultado de contagem física
       *   opening              - saldo inicial
       */
      table.string('movement_type', 30).notNullable();

      // Quantidade SEMPRE positiva. O sinal é determinado por movement_type.
      table.decimal('quantity', 18, 4).notNullable();

      // Custo unitário do movimento (pra calcular avg_cost)
      table.decimal('unit_cost', 18, 4).nullable();

      // Balance após este movimento (snapshot pra auditoria rápida)
      table.decimal('balance_after', 18, 4).notNullable();

      // Origem do movimento (rastreabilidade)
      // reference_type: 'sales_document' | 'purchase_document' | 'stock_transfer' |
      //                 'inventory_count' | 'manual_adjustment' | 'opening'
      table.string('reference_type', 30).notNullable();
      table.uuid('reference_id').nullable();
      table.string('reference_number', 60).nullable(); // ex.: doc_number, count_number

      // Rastreabilidade adicional (lote/série)
      table.string('lot_number', 120).nullable();
      table.string('serial_number', 120).nullable();

      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('movement_date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      // Movimentos são imutáveis — sem updated_at
      table.index(['organization_id', 'product_id', 'movement_date']);
      table.index(['organization_id', 'warehouse_id', 'movement_date']);
      table.index(['organization_id', 'reference_type', 'reference_id']);
    });
  }

  // ─── STOCK TRANSFERS ───────────────────────────────────────────────────
  if (!(await knex.schema.hasTable('stock_transfers'))) {
    await knex.schema.createTable('stock_transfers', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('transfer_number', 40).notNullable();

      table.uuid('warehouse_from_id').notNullable().references('id').inTable('stock_warehouses').onDelete('RESTRICT');
      table.uuid('warehouse_to_id').notNullable().references('id').inTable('stock_warehouses').onDelete('RESTRICT');

      // 'draft' | 'confirmed' (movimentos gerados) | 'cancelled'
      table.string('status', 20).notNullable().defaultTo('draft');

      table.date('transfer_date').notNullable();
      table.text('notes').nullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('confirmed_at', { useTz: true }).nullable();

      table.unique(['organization_id', 'transfer_number']);
      table.index(['organization_id', 'status']);
    });
  }

  if (!(await knex.schema.hasTable('stock_transfer_items'))) {
    await knex.schema.createTable('stock_transfer_items', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('transfer_id').notNullable().references('id').inTable('stock_transfers').onDelete('CASCADE');
      table.uuid('product_id').notNullable().references('id').inTable('sales_products').onDelete('RESTRICT');
      table.decimal('quantity', 18, 4).notNullable();
      table.text('notes').nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'transfer_id']);
      table.unique(['transfer_id', 'product_id']);
    });
  }

  // ─── INVENTORY COUNTS (contagem física) ─────────────────────────────────
  if (!(await knex.schema.hasTable('stock_inventory_counts'))) {
    await knex.schema.createTable('stock_inventory_counts', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('warehouse_id').notNullable().references('id').inTable('stock_warehouses').onDelete('RESTRICT');

      table.string('count_number', 40).notNullable();
      table.string('name', 180).notNullable(); // "Contagem Q2 2026"

      // 'open' | 'counting' (em andamento) | 'closed' (ajustes gerados) | 'cancelled'
      table.string('status', 20).notNullable().defaultTo('open');

      // 'full' (todo armazém) | 'partial' (filtrado por categoria/local)
      table.string('count_type', 20).notNullable().defaultTo('full');

      // Filtros opcionais para contagem parcial
      table.string('category_filter', 80).nullable();

      table.text('notes').nullable();
      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('closed_at', { useTz: true }).nullable();

      table.unique(['organization_id', 'count_number']);
      table.index(['organization_id', 'status']);
    });
  }

  if (!(await knex.schema.hasTable('stock_inventory_count_items'))) {
    await knex.schema.createTable('stock_inventory_count_items', (table) => {
      table.uuid('id').primary();
      table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
      table.uuid('count_id').notNullable().references('id').inTable('stock_inventory_counts').onDelete('CASCADE');
      table.uuid('product_id').notNullable().references('id').inTable('sales_products').onDelete('RESTRICT');

      // Quantidade esperada (snapshot do balance no momento de abrir a contagem)
      table.decimal('expected_quantity', 18, 4).notNullable();
      // Quantidade efetivamente contada pelo operador (null = ainda não contado)
      table.decimal('counted_quantity', 18, 4).nullable();
      // Diferença = counted - expected (positiva = sobrou, negativa = faltou)
      table.decimal('difference', 18, 4).nullable();

      table.text('notes').nullable();
      table.uuid('counted_by_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('counted_at', { useTz: true }).nullable();
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['count_id', 'product_id']);
      table.index(['organization_id', 'count_id']);
    });
  }

  // ─── BOOTSTRAP: cria armazém DEFAULT por org existente ─────────────────
  // Pra orgs antigas funcionarem com o novo modelo sem quebra.
  const orgsWithoutWarehouse = await knex('organizations as o')
    .leftJoin('stock_warehouses as w', function () {
      this.on('w.organization_id', '=', 'o.id').andOn(
        knex.raw('w.is_default = ?', [true]),
      );
    })
    .whereNull('w.id')
    .select<Array<{ id: string }>>('o.id');

  const now = new Date();
  for (const org of orgsWithoutWarehouse) {
    const wid = randomUUID();
    await knex('stock_warehouses').insert({
      id: wid,
      organization_id: org.id,
      code: 'PRINCIPAL',
      name: 'Armazém Principal',
      is_default: true,
      is_active: true,
      warehouse_type: 'physical',
      created_at: now,
      updated_at: now,
    });

    // Para cada produto da org, cria balance no armazém default com o stock_qty atual
    // + movimento de "opening" para registrar saldo inicial.
    const products = await knex('sales_products')
      .where({ organization_id: org.id })
      .select<Array<{ id: string; stock_qty: string | number; price_cost: string | number }>>(
        'id',
        'stock_qty',
        'price_cost',
      );
    for (const p of products) {
      const qty = Number(p.stock_qty);
      await knex('stock_warehouse_balances').insert({
        id: randomUUID(),
        organization_id: org.id,
        product_id: p.id,
        warehouse_id: wid,
        quantity: qty,
        avg_cost: Number(p.price_cost ?? 0),
        updated_at: now,
      });
      if (qty !== 0) {
        await knex('stock_movements').insert({
          id: randomUUID(),
          organization_id: org.id,
          product_id: p.id,
          warehouse_id: wid,
          movement_type: 'opening',
          quantity: Math.abs(qty),
          unit_cost: Number(p.price_cost ?? 0),
          balance_after: qty,
          reference_type: 'opening',
          notes: 'Saldo inicial gerado por migração de inventário avançado',
          movement_date: now,
          created_at: now,
        });
      }
      // Aponta default_warehouse_id no produto
      await knex('sales_products').where({ id: p.id }).update({ default_warehouse_id: wid });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stock_inventory_count_items');
  await knex.schema.dropTableIfExists('stock_inventory_counts');
  await knex.schema.dropTableIfExists('stock_transfer_items');
  await knex.schema.dropTableIfExists('stock_transfers');
  await knex.schema.dropTableIfExists('stock_movements');
  await knex.schema.dropTableIfExists('stock_warehouse_balances');
  if (await knex.schema.hasColumn('sales_products', 'default_warehouse_id')) {
    await knex.schema.alterTable('sales_products', (table) => {
      table.dropColumn('default_warehouse_id');
    });
  }
  await knex.schema.dropTableIfExists('stock_warehouses');
}
