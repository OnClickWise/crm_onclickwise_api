import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Verificar se a tabela já existe (pode ter sido criada manualmente)
  const exists = await knex.schema.hasTable('organizations');
  if (exists) {
    console.log('Table "organizations" already exists, skipping creation');
    return;
  }
  
  return knex.schema.createTable('organizations', function(table) {
    table.uuid('id').primary();
    table.text('name').notNullable();
    table.text('slug').notNullable();
    table.text('custom_domain');
    table.text('phone');
    table.text('email');
    table.text('address');
    table.text('city');
    table.text('state');
    table.text('country');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.text('logo_url');
    table.text('primary_color');
    table.text('secondary_color');
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('organizations');
}
