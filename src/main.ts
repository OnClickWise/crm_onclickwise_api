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
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { mkdir, access, constants } from 'fs/promises';
import { existsSync } from 'fs';

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

  const origins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
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
      'x-tenant-id',
      'X-Requested-With',
      'Accept',
      'Range' // Adicionado Range aqui também
    ],
  });

  // CSP Header para permitir áudio
  app.use((req, res, next) => {
    res.setHeader( 
      'Content-Security-Policy',
      "default-src 'self'; media-src 'self' data: blob: https://api.onclickwise.com.br; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;"
    );
    next();
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
 
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
    logger.error(`✗ Erro ao configurar diretório de uploads: ${error.message}`);
  }

  // --- CONFIGURAÇÃO CORRIGIDA DOS ESTÁTICOS ---
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
    setHeaders: (res, path, stat) => {
      // IMPORTANTE: Trocamos '*' pelo domínio exato por causa do credentials:true
      res.setHeader('Access-Control-Allow-Origin', 'https://onclickwise.com.br');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization, x-tenant-id');
      
      // Essencial para Streaming de Áudio (Erro 206)
      res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Encoding, Content-Length, Content-Range');
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Cache control para evitar que o navegador guarde erros de áudio
      res.setHeader('Cache-Control', 'no-cache');
    },
  });

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