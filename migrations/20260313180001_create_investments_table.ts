import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasPortfolios = await knex.schema.hasTable('portfolios');
  if (!hasPortfolios) {
    throw new Error('Table "portfolios" does not exist. Please run migrations in order.');
  }

  const hasInvestments = await knex.schema.hasTable('investments');
  if (hasInvestments) {
    return;
  }

  await knex.schema.createTable('investments', (table) => {
    table.uuid('id').primary();
    table.uuid('portfolio_id').notNullable().references('id').inTable('portfolios').onDelete('CASCADE');
    table.text('asset_name').notNullable();
    table.text('asset_type').notNullable();
    table.decimal('quantity', 18, 4).notNullable().defaultTo(0);
    table.decimal('average_price', 18, 2).notNullable().defaultTo(0);
    table.decimal('total_invested', 18, 2).notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['portfolio_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('investments');
}
