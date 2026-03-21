import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { APP_CORS_ORIGINS_ALLOWED } from './shared/config/config';
import contentParser from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { join } from 'path';


async function bootstrap() {
  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 10);
  const maxUploadBytes = maxUploadMb * 1024 * 1024;

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: maxUploadBytes,
    }),
  );

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

  // Servir arquivos estáticos da pasta uploads
  await app.register(fastifyStatic, {
    // Uploads são salvos em process.cwd()/uploads no controller de organização.
    // Usar a mesma raiz evita 404 em produção e em modo build.
    root: join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });

  await app.listen({
    port: Number(process.env.APP_PORT) || 8080,
    host: '0.0.0.0',
  });
  
}

bootstrap();
