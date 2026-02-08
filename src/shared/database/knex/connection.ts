import knex from 'knex';
import { env } from 'src/shared/config/env';


export const db = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
});
