import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasLeads = await knex.schema.hasTable('leads');
  if (!hasLeads) {
    return;
  }

  const hasLocation = await knex.schema.hasColumn('leads', 'location');
  const hasInterest = await knex.schema.hasColumn('leads', 'interest');

  if (!hasLocation || !hasInterest) {
    await knex.schema.alterTable('leads', (table) => {
      if (!hasLocation) {
        table.string('location', 150).nullable();
      }
      if (!hasInterest) {
        table.string('interest', 255).nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLeads = await knex.schema.hasTable('leads');
  if (!hasLeads) {
    return;
  }

  const hasLocation = await knex.schema.hasColumn('leads', 'location');
  const hasInterest = await knex.schema.hasColumn('leads', 'interest');

  if (hasLocation || hasInterest) {
    await knex.schema.alterTable('leads', (table) => {
      if (hasLocation) {
        table.dropColumn('location');
      }
      if (hasInterest) {
        table.dropColumn('interest');
      }
    });
  }
}
