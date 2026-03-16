import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasInvestments = await knex.schema.hasTable('investments');
  if (!hasInvestments) {
    throw new Error('Table "investments" does not exist. Please run migrations in order.');
  }

  const hasDividends = await knex.schema.hasTable('dividends');
  if (hasDividends) {
    return;
  }

  await knex.schema.createTable('dividends', (table) => {
    table.uuid('id').primary();
    table.uuid('investment_id').notNullable().references('id').inTable('investments').onDelete('CASCADE');
    table.decimal('value', 18, 2).notNullable();
    table.timestamp('date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.text('type').notNullable().defaultTo('dividendo');
    table.text('notes').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['investment_id']);
    table.index(['date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dividends');
}