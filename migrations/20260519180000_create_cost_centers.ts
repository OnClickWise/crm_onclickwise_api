import type { Knex } from 'knex';

/**
 * Fase 3 — Centro de Custos.
 *
 * Centros de custo são uma dimensão gerencial que permite atribuir receitas
 * e despesas a áreas/projetos/filiais da empresa, independente do plano de
 * contas contábil. Ex.: "Filial SP", "Projeto Alpha", "Marketing".
 *
 *  - `cost_centers`: cadastro hierárquico (parent_id opcional).
 *  - `cost_center_id` em linhas de lançamento contábil + documentos de
 *    venda e compra — permite relatórios gerenciais por centro de custo.
 */
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable('cost_centers'))) {
    await knex.schema.createTable('cost_centers', (table) => {
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

      // Hierarquia opcional
      table
        .uuid('parent_id')
        .nullable()
        .references('id')
        .inTable('cost_centers')
        .onDelete('RESTRICT');

      // Responsável pelo centro de custo
      table.uuid('manager_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');

      // Orçamento mensal previsto (gerencial — usado em orçado vs realizado)
      table.decimal('monthly_budget', 18, 2).nullable();

      table.boolean('is_active').notNullable().defaultTo(true);

      table.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

      table.unique(['organization_id', 'code']);
      table.index(['organization_id', 'is_active']);
      table.index(['organization_id', 'parent_id']);
    });
  }

  // Dimensão de centro de custo nas linhas de lançamento contábil
  if (!(await knex.schema.hasColumn('accounting_journal_entry_lines', 'cost_center_id'))) {
    await knex.schema.alterTable('accounting_journal_entry_lines', (table) => {
      table.uuid('cost_center_id').nullable();
      table.index(['cost_center_id']);
    });
  }

  // Centro de custo padrão em documentos de venda
  if (!(await knex.schema.hasColumn('sales_documents', 'cost_center_id'))) {
    await knex.schema.alterTable('sales_documents', (table) => {
      table.uuid('cost_center_id').nullable();
    });
  }

  // Centro de custo padrão em documentos de compra
  if (!(await knex.schema.hasColumn('purchase_documents', 'cost_center_id'))) {
    await knex.schema.alterTable('purchase_documents', (table) => {
      table.uuid('cost_center_id').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn('purchase_documents', 'cost_center_id')) {
    await knex.schema.alterTable('purchase_documents', (table) => {
      table.dropColumn('cost_center_id');
    });
  }
  if (await knex.schema.hasColumn('sales_documents', 'cost_center_id')) {
    await knex.schema.alterTable('sales_documents', (table) => {
      table.dropColumn('cost_center_id');
    });
  }
  if (await knex.schema.hasColumn('accounting_journal_entry_lines', 'cost_center_id')) {
    await knex.schema.alterTable('accounting_journal_entry_lines', (table) => {
      table.dropColumn('cost_center_id');
    });
  }
  await knex.schema.dropTableIfExists('cost_centers');
}
