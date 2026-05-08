import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

const TEREVITA_SLUG = 'terevita';
const TEREVITA_NAME = 'Terevita';

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    console.log('Table "organizations" does not exist, skipping terevita seed');
    return;
  }

  const existing = await knex('organizations')
    .where({ slug: TEREVITA_SLUG })
    .first('id');

  if (existing) {
    console.log('Organization "terevita" already exists, skipping seed');
    return;
  }

  await knex('organizations').insert({
    id: randomUUID(),
    name: TEREVITA_NAME,
    slug: TEREVITA_SLUG,
    created_at: knex.fn.now(),
  });

  console.log('Seeded organization "terevita"');
}

export async function down(): Promise<void> {
  // Intentionally no-op to avoid deleting tenant data.
}
