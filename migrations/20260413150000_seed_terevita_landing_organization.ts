import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

const ORGANIZATION_SLUG = 'terevita';

const DEFAULT_STAGES = [
  {
    name: 'New Leads',
    slug: 'new',
    translation_key: 'Pipeline.stages.new',
    color: 'bg-blue-100 border-blue-200 text-blue-800',
    stage_type: 'entry',
    order: 1,
  },
  {
    name: 'In Contact',
    slug: 'contact',
    translation_key: 'Pipeline.stages.contact',
    color: 'bg-yellow-100 border-yellow-200 text-yellow-800',
    stage_type: 'progress',
    order: 2,
  },
  {
    name: 'Qualified',
    slug: 'qualified',
    translation_key: 'Pipeline.stages.qualified',
    color: 'bg-green-100 border-green-200 text-green-800',
    stage_type: 'won',
    order: 3,
  },
  {
    name: 'Lost',
    slug: 'lost',
    translation_key: 'Pipeline.stages.lost',
    color: 'bg-red-100 border-red-200 text-red-800',
    stage_type: 'lost',
    order: 4,
  },
];

export async function up(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    throw new Error('Table "organizations" does not exist. Please run migrations in order.');
  }

  const existingOrganization = await knex('organizations')
    .where({ slug: ORGANIZATION_SLUG })
    .first('id');

  let organizationId = existingOrganization?.id as string | undefined;

  if (!organizationId) {
    organizationId = randomUUID();

    await knex('organizations').insert({
      id: organizationId,
      name: 'Terevita',
      slug: ORGANIZATION_SLUG,
      email: null,
      phone: null,
      address: null,
      city: null,
      state: null,
      country: null,
      custom_domain: null,
      logo_url: null,
      primary_color: '#9A6A3A',
      secondary_color: '#F5E8D8',
      company_id: null,
      password: null,
      created_at: knex.fn.now(),
    });

    console.log('✅ Seeded "terevita" organization for public landing');
  }

  const hasPipelineStages = await knex.schema.hasTable('pipeline_stages');
  if (!hasPipelineStages) {
    return;
  }

  const existingStages = await knex('pipeline_stages')
    .where({ organization_id: organizationId })
    .first('id');

  if (existingStages) {
    return;
  }

  await knex('pipeline_stages').insert(
    DEFAULT_STAGES.map((stage) => ({
      id: randomUUID(),
      organization_id: organizationId,
      ...stage,
      is_active: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    })),
  );

  console.log('✅ Seeded default pipeline stages for "terevita"');
}

export async function down(knex: Knex): Promise<void> {
  const hasOrganizations = await knex.schema.hasTable('organizations');
  if (!hasOrganizations) {
    return;
  }

  const organization = await knex('organizations')
    .where({ slug: ORGANIZATION_SLUG })
    .first('id');

  if (!organization) {
    return;
  }

  const hasPipelineStages = await knex.schema.hasTable('pipeline_stages');
  if (hasPipelineStages) {
    await knex('pipeline_stages')
      .where({ organization_id: organization.id })
      .delete();
  }

  await knex('organizations')
    .where({ id: organization.id })
    .delete();
}