import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasPortfolios = await knex.schema.hasTable('portfolios');
  if (!hasPortfolios) {
    throw new Error('Table "portfolios" does not exist. Please run migrations in order.');
  }

  const hasContributions = await knex.schema.hasTable('contributions');
  if (hasContributions) {
    return;
  }

  await knex.schema.createTable('contributions', (table) => {
    table.uuid('id').primary();
    table.uuid('portfolio_id').notNullable().references('id').inTable('portfolios').onDelete('CASCADE');
    table.uuid('investment_id').nullable().references('id').inTable('investments').onDelete('SET NULL');
    table.enum('type', ['aporte', 'retirada']).notNullable().defaultTo('aporte');
    table.decimal('value', 18, 2).notNullable();
    table.decimal('quantity', 18, 8).nullable();
    table.decimal('price', 18, 2).nullable();
    table.timestamp('date', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.text('note').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['portfolio_id']);
    table.index(['investment_id']);
    table.index(['date']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('contributions');
}