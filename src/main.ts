import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { APP_CORS_ORIGINS_ALLOWED } from './shared/config/config';
import contentParser from '@fastify/multipart';


async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const origins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://127.0.0.1:8080',
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
      fieldSize: 100,          // Max field value size in bytes
      fields: 1,              // Max number of non-file fields
      fileSize: 50 * 1024 * 1024, // 50MB (em bytes)
      files: 1,                // Max number of file fields
    },}
  );

  await app.listen({
    port: Number(process.env.APP_PORT) || 8080,
    host: '0.0.0.0',
  });
  
}

bootstrap();
