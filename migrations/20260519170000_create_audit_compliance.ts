import type { Knex } from 'knex';

/**
 * Fase 2 — Audit Log Universal + Compliance LGPD/GDPR.
 *
 *  - `audit_logs`: trilha de auditoria imutável. Captura QUEM fez O QUÊ,
 *    QUANDO e a partir de ONDE. Alimentada automaticamente por um
 *    interceptor global (toda requisição mutante) e, opcionalmente, por
 *    chamadas explícitas de serviços que precisam registrar diff fino.
 *    Requisito central de ISO 9001 e LGPD (rastreabilidade).
 *
 *  - `customers.anonymized_at` / `is_anonymized`: marca clientes cujos dados
 *    pessoais foram anonimizados a pedido do titular (direito ao
 *    esquecimento). Os registros financeiros/fiscais são preservados —
 *    apenas os dados identificáveis são removidos.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('audit_logs'))) {
    await knex.schema.createTable('audit_logs', (table) => {
      table.uuid('id').primary();
      // Nullable: ações pré-organização (ex.: tentativa de login)
      table.uuid('organization_id').nullable();

      // Quem (snapshot — sobrevive à exclusão do usuário)
      table.uuid('user_id').nullable();
      table.string('user_name', 255).nullable();
      table.string('user_role', 40).nullable();

      // O quê
      // action: create | update | delete | login | logout | export |
      //         anonymize | status_change | other
      table.string('action', 30).notNullable();
      // Tipo da entidade derivado da rota (ex.: 'sales/documents')
      table.string('entity_type', 80).nullable();
      table.uuid('entity_id').nullable();

      // Contexto HTTP
      table.string('http_method', 10).nullable();
      table.string('http_route', 500).nullable();
      table.integer('http_status').nullable();
      table.integer('duration_ms').nullable();

      // Conteúdo: payload sanitizado (sem senhas/tokens) ou diff before/after
      table.jsonb('changes').nullable();

      // De onde
      table.string('ip_address', 64).nullable();
      table.string('user_agent', 500).nullable();

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'created_at']);
      table.index(['organization_id', 'entity_type', 'entity_id']);
      table.index(['organization_id', 'user_id']);
      table.index(['organization_id', 'action']);
    });
  }

  // Anonimização de clientes (LGPD — direito ao esquecimento)
  if (!(await knex.schema.hasColumn('customers', 'anonymized_at'))) {
    await knex.schema.alterTable('customers', (table) => {
      table.timestamp('anonymized_at', { useTz: true }).nullable();
      table.boolean('is_anonymized').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('customers', 'anonymized_at')) {
    await knex.schema.alterTable('customers', (table) => {
      table.dropColumn('is_anonymized');
      table.dropColumn('anonymized_at');
    });
  }
  await knex.schema.dropTableIfExists('audit_logs');
}
