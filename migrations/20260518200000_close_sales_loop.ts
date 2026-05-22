import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

/**
 * Fechamento do módulo de Vendas para uso enterprise:
 *
 *  - Customers: bloqueio + validação fiscal
 *    * `is_blocked` + `block_reason` + `blocked_at`: cliente em atraso/risco
 *      não pode criar novos documentos (override por admin).
 *    * `tax_id_valid` + `tax_id_validated_at`: cache do resultado da validação
 *      algorítmica do documento fiscal (CNPJ/CPF/NIF/NIPC/NIE).
 *
 *  - Sales Document Series (multi-série por tipo):
 *    Substitui a numeração simples por séries customizáveis.
 *    Ex.: FAT-2026/A (matriz), FAT-2026/B (filial Loanda), FAT-ONLINE/2026.
 *    Cada série tem seu próprio contador atômico.
 *    Migração: bootstrap cria série "default" pra cada (org, doc_type) já
 *    existente e transfere o last_number atual.
 *
 *  - sales_documents.series_id: documentos passam a apontar pra uma série.
 *    NULL para documentos antigos (compatibilidade).
 *
 *  - entity_attachments (universal):
 *    Anexa arquivos a qualquer entidade (sales_document, customer, product,
 *    fulfillment, purchase_document futuro…). Referencia o módulo uploads
 *    existente pelo upload_id.
 */
export async function up(knex: Knex): Promise<void> {
  // ─── Customers: bloqueio + validação fiscal ─────────────────────────────
  if (!(await knex.schema.hasColumn('customers', 'is_blocked'))) {
    await knex.schema.alterTable('customers', (table) => {
      table.boolean('is_blocked').notNullable().defaultTo(false);
      table.text('block_reason').nullable();
      table.timestamp('blocked_at', { useTz: true }).nullable();
      table.uuid('blocked_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.boolean('tax_id_valid').nullable(); // null = não validado
      table.timestamp('tax_id_validated_at', { useTz: true }).nullable();
    });
  }

  // ─── SALES DOCUMENT SERIES ──────────────────────────────────────────────
  if (!(await knex.schema.hasTable('sales_document_series'))) {
    await knex.schema.createTable('sales_document_series', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      // Tipo de documento ao qual essa série pertence
      table.string('doc_type', 20).notNullable();

      // Identificador curto da série: A, B, ONLINE, ECOMMERCE...
      table.string('series_code', 20).notNullable();
      // Nome amigável: "Série A — Matriz", "Loja online"
      table.string('name', 180).notNullable();

      // Prefixo de impressão (FAT, ORC, GR, NC, DEV)
      table.string('prefix', 10).notNullable();

      // Ano corrente (contador reseta por ano)
      table.integer('year').notNullable();
      table.integer('last_number').notNullable().defaultTo(0);

      // Apenas uma série é default por (org, doc_type)
      table.boolean('is_default').notNullable().defaultTo(false);
      table.boolean('is_active').notNullable().defaultTo(true);

      // Validade fiscal (alguns países exigem AT/AGT homologar séries)
      table.string('fiscal_authorization_code', 60).nullable();

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'doc_type', 'series_code', 'year']);
      table.index(['organization_id', 'doc_type', 'is_active']);
    });
  }

  // sales_documents.series_id (nullable — compatibilidade com documentos antigos)
  if (!(await knex.schema.hasColumn('sales_documents', 'series_id'))) {
    await knex.schema.alterTable('sales_documents', (table) => {
      table.uuid('series_id').nullable().references('id').inTable('sales_document_series').onDelete('SET NULL');
    });
  }

  // ─── ENTITY ATTACHMENTS (anexos universais) ─────────────────────────────
  if (!(await knex.schema.hasTable('entity_attachments'))) {
    await knex.schema.createTable('entity_attachments', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      /**
       * Referência polimórfica. O service NÃO faz JOIN — apenas valida
       * pela combinação (reference_type, reference_id, organization_id).
       *
       * Tipos suportados: 'sales_document', 'customer', 'product',
       * 'sales_fulfillment', 'purchase_document', 'inventory_count', etc.
       */
      table.string('reference_type', 40).notNullable();
      table.uuid('reference_id').notNullable();

      // Metadata do arquivo (cópia para evitar JOIN no listing)
      table.string('file_name', 255).notNullable();
      table.string('file_url', 1000).notNullable(); // URL pro storage (S3, local, etc.)
      table.string('mime_type', 100).nullable();
      table.bigInteger('file_size').nullable(); // bytes

      // Categoria livre: "po_cliente", "comprovante_pagamento", "foto_produto", "contrato"...
      table.string('category', 60).nullable();
      table.text('description').nullable();

      table.uuid('uploaded_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'reference_type', 'reference_id']);
    });
  }

  // ─── BOOTSTRAP: migrar numeração antiga → séries default ───────────────
  // Para cada (org, doc_type) em sales_document_numbering, cria série default
  // copiando o last_number atual. Documentos antigos ficam com series_id=NULL
  // mas isso não quebra nada — apenas novos passarão a usar séries.
  const oldNumberings = await knex('sales_document_numbering').select<
    Array<{
      organization_id: string;
      doc_type: string;
      prefix: string;
      year: number;
      last_number: number;
    }>
  >('organization_id', 'doc_type', 'prefix', 'year', 'last_number');

  const now = new Date();
  for (const n of oldNumberings) {
    const existing = await knex('sales_document_series')
      .where({
        organization_id: n.organization_id,
        doc_type: n.doc_type,
        series_code: 'A',
        year: n.year,
      })
      .first();
    if (existing) continue;

    await knex('sales_document_series').insert({
      id: randomUUID(),
      organization_id: n.organization_id,
      doc_type: n.doc_type,
      series_code: 'A',
      name: 'Série Principal',
      prefix: n.prefix,
      year: n.year,
      last_number: n.last_number,
      is_default: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('sales_documents', 'series_id')) {
    await knex.schema.alterTable('sales_documents', (table) => {
      table.dropColumn('series_id');
    });
  }
  await knex.schema.dropTableIfExists('entity_attachments');
  await knex.schema.dropTableIfExists('sales_document_series');
  if (await knex.schema.hasColumn('customers', 'is_blocked')) {
    await knex.schema.alterTable('customers', (table) => {
      table.dropColumn('tax_id_validated_at');
      table.dropColumn('tax_id_valid');
      table.dropColumn('blocked_by');
      table.dropColumn('blocked_at');
      table.dropColumn('block_reason');
      table.dropColumn('is_blocked');
    });
  }
}
