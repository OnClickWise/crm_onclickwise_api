import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  const hasUsers = await knex.schema.hasTable('users');
  const hasLeads = await knex.schema.hasTable('leads');
  if (!hasOrganizations) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }
  if (!hasUsers) {
    throw new Error('Table "users" does not exist. Please run migrations in order.');
  }
  if (hasLeads) {
    console.log('Table "leads" already exists, skipping creation');
    return;
  }
  return knex.schema.createTable('leads', function(table) {
    table.uuid('id').primary();
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('assigned_user_id').references('id').inTable('users').onDelete('SET NULL');
    // Dados básicos
    table.string('name', 150).notNullable();
    table.string('email', 150).notNullable();
    table.string('phone', 30);
    table.string('ssn', 30);                 // CPF / Social Security Number
    table.string('ein', 30);                 // CNPJ / Employer Identification Number (para empresas)
    // Origem e status
    table.string('source', 100);             // Ex: 'Landing Page', 'Instagram', 'Referral'
    table.string('status', 50).defaultTo('New'); // Ex: 'New', 'In Contact', 'Qualified', 'Lost'
    // Informações comerciais
    table.decimal('value', 12, 2);           // Valor potencial da venda
    table.text('description');               // Observações ou anotações
    table.date('estimated_close_date');      // 🗓️ Data estimada de fechamento do acordo
    // Auditoria
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('leads');
}
