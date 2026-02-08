import { env } from './src/shared/config/env';

export default {
  client: 'pg',
  connection: env.DATABASE_URL,
  migrations: {
    directory: './src/shared/database/knex/migrations',
  },
};
