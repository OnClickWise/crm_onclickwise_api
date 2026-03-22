import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Index para queries de agregação em investments
  await knex.schema.table('investments', (table) => {
    table.index(['portfolio_id', 'total_invested', 'current_value', 'profit'], 'idx_investments_portfolio_aggregation');
  });

  // Index composto para queries de portfolios
  await knex.schema.table('portfolios', (table) => {
    table.index(['organization_id', 'investor_id'], 'idx_portfolios_org_investor');
  });

  // Index composto para contributions
  await knex.schema.table('contributions', (table) => {
    table.index(['portfolio_id', 'date'], 'idx_contributions_portfolio_date');
    table.index(['investment_id', 'type'], 'idx_contributions_investment_type');
  });

  // Index para investors
  await knex.schema.table('investors', (table) => {
    table.index(['is_active'], 'idx_investors_active');
  });

  // Index para carteiras ativas
  await knex.schema.table('portfolios', (table) => {
    table.index(['is_active'], 'idx_portfolios_active');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('investments', (table) => {
    table.dropIndex([], 'idx_investments_portfolio_aggregation');
  });

  await knex.schema.table('portfolios', (table) => {
    table.dropIndex([], 'idx_portfolios_org_investor');
    table.dropIndex([], 'idx_portfolios_active');
  });

  await knex.schema.table('contributions', (table) => {
    table.dropIndex([], 'idx_contributions_portfolio_date');
    table.dropIndex([], 'idx_contributions_investment_type');
  });

  await knex.schema.table('investors', (table) => {
    table.dropIndex([], 'idx_investors_active');
  });
}
