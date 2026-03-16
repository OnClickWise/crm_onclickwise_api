import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasPortfolios = await knex.schema.hasTable('portfolios');
  if (!hasPortfolios) {
    throw new Error('Table "portfolios" does not exist. Please run migrations in order.');
  }

  const hasUserId = await knex.schema.hasColumn('portfolios', 'user_id');
  if (!hasUserId) {
    await knex.schema.alterTable('portfolios', (table) => {
      table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
      table.index(['user_id']);
    });
  }

  const hasInvestorId = await knex.schema.hasColumn('portfolios', 'investor_id');
  if (hasInvestorId) {
    await knex.raw('ALTER TABLE portfolios ALTER COLUMN investor_id DROP NOT NULL');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUserId = await knex.schema.hasColumn('portfolios', 'user_id');
  if (hasUserId) {
    await knex.schema.alterTable('portfolios', (table) => {
      table.dropIndex(['user_id']);
      table.dropColumn('user_id');
    });
  }

  const hasInvestorId = await knex.schema.hasColumn('portfolios', 'investor_id');
  if (hasInvestorId) {
    await knex.raw('ALTER TABLE portfolios ALTER COLUMN investor_id SET NOT NULL');
  }
}