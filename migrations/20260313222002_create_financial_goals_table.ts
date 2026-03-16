import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    throw new Error('Table "users" does not exist. Please run migrations in order.');
  }

  const hasGoals = await knex.schema.hasTable('financial_goals');
  if (hasGoals) {
    return;
  }

  await knex.schema.createTable('financial_goals', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('category').notNullable();
    table.decimal('target_amount', 18, 2).notNullable();
    table.decimal('current_amount', 18, 2).notNullable().defaultTo(0);
    table.timestamp('target_date', { useTz: true }).nullable();
    table.text('description').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.index(['organization_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('financial_goals');
}