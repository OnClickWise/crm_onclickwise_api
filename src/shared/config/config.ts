import dotenv from 'dotenv';

// Carregar variáveis de ambiente do arquivo .env
dotenv.config();

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const endpoint: string = process.env.ENDPOINT || '';
export const token: string = process.env.TOKEN || '';

export const JWT_ACCESS_EXPIRES = '15m'
export const JWT_REFRESH_EXPIRES = '7d'

export const JWT_SECRET = requiredEnv('JWT_SECRET');
export const JWT_REFRESH_SECRET = requiredEnv('JWT_REFRESH_SECRET');


// Exportar variáveis de ambiente
export const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_DATABASE,
  DB_CLIENT,
  SENDGRID_API_KEY = '',
  NODE_ENV,
  APP_PORT = 8080,
  RABBITMQ_URL = 'amqp://user:password@localhost:5672',
  QUEUE_PROVIDER = 'rabbitmq',
  OPENAI_API_KEY,
 
  CALLS_BUCKET_NAME = 'calls-quality-jobhome',
  COOKIE_DOMAIN = '',
} = process.env;
export const STORAGE_PROVIDER: string = process.env.STORAGE_PROVIDER || 'minio';

// Configuração cors, separado por virgula
export const APP_CORS_ORIGINS_ALLOWED = (
  process.env['APP_CORS_ORIGINS_ALLOWED'] || ''
).split(',');
