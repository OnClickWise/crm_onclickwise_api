import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users')
  const hasRefreshTokens = await knex.schema.hasTable('refresh_tokens')
  if (!hasUsers) {
    throw new Error(
      'Table "users" does not exist. Please run migrations in order.',
    )
  }
  if (hasRefreshTokens) {
    console.log('Table "refresh_tokens" already exists, skipping creation')
    return;
  }
  return knex.schema.createTable('refresh_tokens', table => {
    table.uuid('id').primary()
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE') // se user deletar → tokens deletam
    table.text('token').notNullable().unique()
    table
      .timestamp('expires_at', { useTz: true })
      .notNullable()
    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
    table
      .timestamp('updated_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('refresh_tokens')
}
