import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    throw new Error('Table "users" does not exist. Please run migrations in order.');
  }

  const hasFinancialFlows = await knex.schema.hasTable('financial_flows');
  if (hasFinancialFlows) {
    return;
  }

  await knex.schema.createTable('financial_flows', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.enum('type', ['income', 'expense']).notNullable();
    table.text('category').notNullable();
    table.text('description').nullable();
    table.decimal('value', 18, 2).notNullable();
    table.timestamp('date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.index(['organization_id']);
    table.index(['date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('financial_flows');
}