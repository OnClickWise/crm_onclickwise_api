import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }

  const hasInvestors = await knex.schema.hasTable('investors');
  if (hasInvestors) {
    return;
  }

  await knex.schema.createTable('investors', (table) => {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.text('name').notNullable();
    table.text('email').notNullable();
    table.text('document');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'email']);
    table.index(['organization_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('investors');
}
