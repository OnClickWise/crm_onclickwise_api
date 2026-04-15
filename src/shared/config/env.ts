import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional().default('development'),
  // Compatibilidade: o projeto usa APP_PORT em vez de PORT em vários pontos.
  PORT: z.coerce.number().optional().default(8080),
  APP_PORT: z.coerce.number().optional().default(8080),
  // Compatibilidade: banco pode vir por DATABASE_URL ou por DB_* em config.ts.
  DATABASE_URL: z.string().optional().default(''),
  UPLOADS_DIR: z.string().optional().default('/tmp/uploads'), // Fallback para produção
  COOKIE_DOMAIN: z.string().optional().default(''),
});

export const env = envSchema.parse(process.env);
