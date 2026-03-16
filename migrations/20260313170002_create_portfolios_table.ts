import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasInvestors = await knex.schema.hasTable('investors');
  if (!hasInvestors) {
    throw new Error('Table "investors" does not exist. Please run migrations in order.');
  }

  const hasPortfolios = await knex.schema.hasTable('portfolios');
  if (hasPortfolios) {
    return;
  }

  await knex.schema.createTable('portfolios', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('investor_id').notNullable().references('id').inTable('investors').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('description');
    table.decimal('initial_amount', 18, 2).notNullable().defaultTo(0);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['organization_id']);
    table.index(['investor_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('portfolios');
}
