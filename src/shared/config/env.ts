import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number(),
  DATABASE_URL: z.string(),
});

export const env = envSchema.parse(process.env);
