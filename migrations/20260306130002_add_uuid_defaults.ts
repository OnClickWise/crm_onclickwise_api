import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Habilitar extensão uuid-ossp
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  // Adicionar DEFAULT uuid_generate_v4() nas colunas id das tabelas existentes
  await knex.raw(`ALTER TABLE projects ALTER COLUMN id SET DEFAULT uuid_generate_v4()`);
  await knex.raw(`ALTER TABLE boards ALTER COLUMN id SET DEFAULT uuid_generate_v4()`);
  await knex.raw(`ALTER TABLE lists ALTER COLUMN id SET DEFAULT uuid_generate_v4()`);
  await knex.raw(`ALTER TABLE cards ALTER COLUMN id SET DEFAULT uuid_generate_v4()`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE projects ALTER COLUMN id DROP DEFAULT`);
  await knex.raw(`ALTER TABLE boards ALTER COLUMN id DROP DEFAULT`);
  await knex.raw(`ALTER TABLE lists ALTER COLUMN id DROP DEFAULT`);
  await knex.raw(`ALTER TABLE cards ALTER COLUMN id DROP DEFAULT`);
}
