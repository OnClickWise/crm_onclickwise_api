import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { APP_CORS_ORIGINS_ALLOWED } from './shared/config/config';
import { env } from './shared/config/env';
import contentParser from '@fastify/multipart';
import { mkdir, access, constants } from 'fs/promises';
import { existsSync } from 'fs';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import cookie from '@fastify/cookie';

function readCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookiePart of cookies) {
    const [rawKey, ...rawValueParts] = cookiePart.trim().split('=');
    if (rawKey === name) {
      return rawValueParts.join('=') || null;
    }
  }

  return null;
}

async function bootstrap() {
  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 25);
  const maxUploadBytes = maxUploadMb * 1024 * 1024;
  const uploadsDir = env.UPLOADS_DIR;

  process.stderr.write(`[BOOTSTRAP_START] UPLOADS_DIR=${uploadsDir}\n`);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: maxUploadBytes,
    }),
  );

  const logger = new Logger('Bootstrap');

  await app.register(cookie);

  const origins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'https://onclickwise.com.br',
    'https://www.onclickwise.com.br',
    'http://onclickwise.com.br',
    'http://www.onclickwise.com.br',
  ];

  if (APP_CORS_ORIGINS_ALLOWED) {
    if (Array.isArray(APP_CORS_ORIGINS_ALLOWED)) {
      origins.push(...APP_CORS_ORIGINS_ALLOWED);
    } else {
      origins.push(APP_CORS_ORIGINS_ALLOWED);
    }
  }

  // CORS Global
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-csrf-token',
      'x-tenant-id',
      'X-Requested-With',
      'Accept',
      'Range'
    ],
  });

  // CSP Header
  app.register(async (app) => {
    app.addHook('onRequest', async (req, reply) => {
      reply.header(
        'Content-Security-Policy',
        "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'self' https://api.onclickwise.com.br https://onclickwise.com.br https://www.onclickwise.com.br; img-src 'self' data: blob:; media-src 'self' data: blob:; script-src 'self'; style-src 'self';"
      );
    });
  });

  app.getHttpAdapter().getInstance().addHook('onRequest', async (req, reply) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return;
    }

    const pathname = (req.raw.url || '').split('?')[0];
    const csrfExemptPaths = new Set([
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/check-company-by-slug',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
    ]);

    if (csrfExemptPaths.has(pathname)) {
      return;
    }

    const csrfCookie = readCookieValue(req.headers.cookie, 'csrfToken');
    const csrfHeader = req.headers['x-csrf-token'];
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;

    if (!csrfCookie || !csrfToken || csrfCookie !== csrfToken) {
      await reply.status(403).send({
        success: false,
        statusCode: 403,
        error: 'CSRF token inválido',
      });
      return;
    }
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
 
  await app.register(contentParser, {
    limits: {
      fieldNameSize: 50,
      fieldSize: 1024 * 1024,
      fields: 1,
      fileSize: maxUploadBytes,
      files: 1,
    },
  });

  try {
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }
    await access(uploadsDir, constants.W_OK);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`✗ Erro ao configurar diretório de uploads: ${message}`);
  }

  const port = Number(process.env.APP_PORT) || 8080;
  await app.listen({
    port: port,
    host: '0.0.0.0',
  });
  
  logger.log(`🚀 API iniciada na porta ${port}`);
}

bootstrap().catch(err => {
  process.stderr.write(`[BOOTSTRAP_FATAL] ${err.message}\n${err.stack}\n`);
  process.exit(1);
});