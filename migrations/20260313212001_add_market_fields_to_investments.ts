import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasInvestments = await knex.schema.hasTable('investments');
  if (!hasInvestments) {
    throw new Error('Table "investments" does not exist. Please run migrations in order.');
  }

  const columns = [
    { name: 'category', create: (table: Knex.AlterTableBuilder) => table.text('category').nullable() },
    { name: 'broker', create: (table: Knex.AlterTableBuilder) => table.text('broker').nullable() },
    { name: 'current_price', create: (table: Knex.AlterTableBuilder) => table.decimal('current_price', 18, 2).notNullable().defaultTo(0) },
    { name: 'current_value', create: (table: Knex.AlterTableBuilder) => table.decimal('current_value', 18, 2).notNullable().defaultTo(0) },
    { name: 'profit', create: (table: Knex.AlterTableBuilder) => table.decimal('profit', 18, 2).notNullable().defaultTo(0) },
    { name: 'profit_percentage', create: (table: Knex.AlterTableBuilder) => table.decimal('profit_percentage', 10, 2).notNullable().defaultTo(0) },
  ];

  for (const column of columns) {
    const exists = await knex.schema.hasColumn('investments', column.name);
    if (!exists) {
      await knex.schema.alterTable('investments', (table) => {
        column.create(table);
      });
    }
  }

  await knex('investments').update({
    current_price: knex.raw('COALESCE(NULLIF(current_price, 0), average_price)'),
    current_value: knex.raw('COALESCE(quantity, 0) * COALESCE(NULLIF(current_price, 0), average_price)'),
    profit: knex.raw('(COALESCE(quantity, 0) * COALESCE(NULLIF(current_price, 0), average_price)) - COALESCE(total_invested, 0)'),
    profit_percentage: knex.raw(`CASE
      WHEN COALESCE(total_invested, 0) > 0 THEN (((COALESCE(quantity, 0) * COALESCE(NULLIF(current_price, 0), average_price)) - COALESCE(total_invested, 0)) / COALESCE(total_invested, 0)) * 100
      ELSE 0
    END`),
  });
}

export async function down(knex: Knex): Promise<void> {
  const dropIfExists = async (column: string) => {
    const exists = await knex.schema.hasColumn('investments', column);
    if (exists) {
      await knex.schema.alterTable('investments', (table) => {
        table.dropColumn(column);
      });
    }
  };

  await dropIfExists('profit_percentage');
  await dropIfExists('profit');
  await dropIfExists('current_value');
  await dropIfExists('current_price');
  await dropIfExists('broker');
  await dropIfExists('category');
}