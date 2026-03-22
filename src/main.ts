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
  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);
  const maxUploadBytes = maxUploadMb * 1024 * 1024;
  const uploadsDir = env.UPLOADS_DIR;

  // Debug: Log environment setup to stderr (guaranteed capture)
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

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-id',
      'X-Requested-With',
    ],
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
      fieldNameSize: 50,      // Max field name size in bytes
      fieldSize: 1024 * 1024, // Max field value size in bytes
      fields: 1,              // Max number of non-file fields
      fileSize: maxUploadBytes,
      files: 1,                // Max number of file fields
    },}
  );

  // Validar e criar diretório de uploads
  try {
    process.stderr.write(`[UPLOADS_CHECK] Verificando diretório: ${uploadsDir}\n`);
    
    if (!existsSync(uploadsDir)) {
      process.stderr.write(`[UPLOADS_CREATE] Criando diretório...\n`);
      await mkdir(uploadsDir, { recursive: true });
      process.stderr.write(`[UPLOADS_SUCCESS] Diretório criado: ${uploadsDir}\n`);
      logger.log(`✓ Diretório de uploads criado: ${uploadsDir}`);
    } else {
      process.stderr.write(`[UPLOADS_EXISTS] Diretório já existe: ${uploadsDir}\n`);
    }

    // Validar permissão de escrita
    process.stderr.write(`[UPLOADS_PERM] Validando permissão de escrita...\n`);
    await access(uploadsDir, constants.W_OK);
    process.stderr.write(`[UPLOADS_OK] Permissão validada\n`);
    logger.log(`✓ Permissão de escrita validada: ${uploadsDir}`);
  } catch (error) {
    process.stderr.write(`[UPLOADS_ERROR] ${error.message}\n`);
    logger.error(`✗ Erro ao configurar diretório de uploads: ${error.message}`);
    logger.warn(`⚠ Uploads podem falhar em produção! Configure a variável UPLOADS_DIR para um volume persistente.`);
  }

  // Servir arquivos estáticos da pasta uploads
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
  });

  process.stderr.write(`[UPLOADS_SERVE] Servindo uploads de: ${uploadsDir}\n`);
  logger.log(`📁 Servindo uploads de: ${uploadsDir}`);

  const port = Number(process.env.APP_PORT) || 8080;
  await app.listen({
    port: port,
    host: '0.0.0.0',
  });
  
  process.stderr.write(`[API_READY] Iniciada na porta ${port}\n`);
  logger.log(`🚀 API iniciada na porta ${port}`);
}

process.stderr.write(`[BOOTSTRAP_INIT] Executando...\n`);
bootstrap().catch(err => {
  process.stderr.write(`[BOOTSTRAP_FATAL] ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
