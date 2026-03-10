import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    console.log('Table "users" already exists, skipping creation');
    return;
  }
  return knex.schema.createTable('users', function(table) {
    table.uuid('id').primary();
    table.text('email').notNullable().unique();
    table.text('password').notNullable();
    table.text('name');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.enum('role', ['admin', 'employee', 'master']).defaultTo('employee');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('users');
}
