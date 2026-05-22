import type { Knex } from 'knex';

/**
 * Sistema GENÉRICO de Workflow de Aprovação.
 *
 *  Conceito: qualquer ação no ERP (criar doc com desconto alto, ultrapassar
 *  limite de crédito, lançar despesa acima de X, alterar comissão...) pode
 *  ser regrada via `approval_rules` e gerar um `approval_request` automático.
 *
 *  - `approval_rules`:
 *     * entity_type: 'sales_document', 'purchase_document', 'expense', etc.
 *     * trigger_condition (JSONB): { field, operator, value, currency? }
 *       Operadores: '>', '>=', '<', '<=', '==', 'in'
 *       Exemplo: { field: 'total_discount_pct', operator: '>=', value: 15 }
 *     * approver_roles: lista de roles que podem aprovar (admin, manager...)
 *     * approver_user_ids: lista de UUIDs específicos (opcional, alternativo)
 *     * priority: 0 = primeira a avaliar (regras mais restritivas primeiro)
 *
 *  - `approval_requests`:
 *     * Polimórfico via (entity_type, entity_id)
 *     * status: pending → approved | rejected | cancelled
 *     * snapshot do valor que disparou (auditoria)
 *     * decisão com motivo
 *
 *  - sales_documents.approval_status:
 *     'not_required' (default), 'pending', 'approved', 'rejected'
 *     Permite consultas rápidas + UI sabe se documento está livre pra avançar
 *     sem JOIN com approval_requests.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('approval_rules'))) {
    await knex.schema.createTable('approval_rules', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.string('name', 180).notNullable();
      table.text('description').nullable();

      // Tipo de entidade alvo
      table.string('entity_type', 40).notNullable();

      /**
       * Condição: avaliada contra o objeto da entidade.
       * Estrutura: { field: string, operator: string, value: number|string|string[] }
       *
       * Exemplos:
       *   { field: 'total_discount_pct', operator: '>=', value: 15 }
       *   { field: 'total', operator: '>=', value: 50000 }
       *   { field: 'currency', operator: 'in', value: ['USD','EUR'] }
       */
      table.jsonb('trigger_condition').notNullable();

      // Quem pode aprovar — pelo menos UM dos dois deve estar preenchido
      table.jsonb('approver_roles').nullable(); // ['master','admin','manager']
      table.jsonb('approver_user_ids').nullable(); // ['uuid','uuid']

      // Quantas aprovações são necessárias (múltiplos aprovadores)
      table.integer('approvals_required').notNullable().defaultTo(1);

      table.integer('priority').notNullable().defaultTo(100); // menor = avalia primeiro

      table.boolean('is_active').notNullable().defaultTo(true);

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'entity_type', 'is_active']);
    });
  }

  if (!(await knex.schema.hasTable('approval_requests'))) {
    await knex.schema.createTable('approval_requests', (table) => {
      table.uuid('id').primary();
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');

      table.uuid('rule_id').nullable().references('id').inTable('approval_rules').onDelete('SET NULL');

      // Polimórfico (mesmo padrão de entity_attachments)
      table.string('entity_type', 40).notNullable();
      table.uuid('entity_id').notNullable();
      // Identificador human-friendly (ex.: "FAT-2026-0042") — facilita UI
      table.string('entity_label', 180).nullable();

      // 'pending' | 'approved' | 'rejected' | 'cancelled'
      table.string('status', 20).notNullable().defaultTo('pending');

      // Snapshot do que disparou
      table.string('triggered_field', 80).notNullable();
      table.string('triggered_operator', 10).notNullable();
      table.jsonb('triggered_value').notNullable(); // valor configurado na regra
      table.jsonb('observed_value').notNullable(); // valor que apareceu no doc

      // Motivo do solicitante
      table.text('reason').nullable();

      // Decisão
      table.text('decision_reason').nullable();
      table.uuid('decided_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('decided_at', { useTz: true }).nullable();

      // Quem aprovaria (cache para a fila — calculado no momento da criação)
      table.jsonb('eligible_approver_user_ids').nullable();

      table.uuid('requested_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('requested_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.index(['organization_id', 'status']);
      table.index(['organization_id', 'entity_type', 'entity_id']);
    });
  }

  // approval_status em sales_documents (cache rápido)
  if (!(await knex.schema.hasColumn('sales_documents', 'approval_status'))) {
    await knex.schema.alterTable('sales_documents', (table) => {
      // 'not_required' | 'pending' | 'approved' | 'rejected'
      table.string('approval_status', 20).notNullable().defaultTo('not_required');
      table.uuid('approval_request_id').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('sales_documents', 'approval_status')) {
    await knex.schema.alterTable('sales_documents', (table) => {
      table.dropColumn('approval_request_id');
      table.dropColumn('approval_status');
    });
  }
  await knex.schema.dropTableIfExists('approval_requests');
  await knex.schema.dropTableIfExists('approval_rules');
}
