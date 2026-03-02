import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('password_reset_tokens');
  if (hasTable) {
    console.log('Table "password_reset_tokens" already exists, skipping creation');
    return;
  }
  
  return knex.schema.createTable('password_reset_tokens', function(table) {
    table.uuid('id').primary();
    table.string('token', 255).notNullable().unique();
    table.uuid('user_id').nullable();
    table.uuid('organization_id').nullable();
    table.string('type', 20).notNullable(); // 'user' or 'organization'
    table.string('email').notNullable();
    table.timestamp('expires_at', { useTz: true }).notNullable();
    table.boolean('used').defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    
    // Indexes for faster lookups
    table.index('token');
    table.index('email');
    table.index('user_id');
    table.index('organization_id');
    table.index('expires_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('password_reset_tokens');
}

