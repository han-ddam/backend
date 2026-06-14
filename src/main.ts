import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe, patchNestJsSwagger } from 'nestjs-zod';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import type { Env } from '@platform/config/env';

/** HTTP entrypoint (API process). */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // --- security ---
  app.use(helmet()); // secure HTTP headers, hides x-powered-by
  // limit request body size (DoS protection); file uploads use their own limits
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  app.enableCors({
    origin:
      corsOrigins === '*'
        ? true
        : corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe()); // zod-based, from nestjs-zod
  app.enableShutdownHooks();

  // --- API docs (Swagger) — disabled in production ---
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    patchNestJsSwagger(); // makes zod DTOs emit OpenAPI schemas
    const doc = new DocumentBuilder()
      .setTitle('한땀 API')
      .setDescription('한땀 백엔드 API 문서')
      .setVersion('0.1')
      .addBearerAuth() // JWT access token
      .addApiKey({ type: 'apiKey', name: 'x-admin-key', in: 'header' }, 'admin-key')
      // context headers — show as inputs on every endpoint in Swagger UI
      .addGlobalParameters(
        {
          name: 'Accept-Language',
          in: 'header',
          required: false,
          schema: { type: 'string', enum: ['ko', 'en', 'ja', 'zh'], default: 'ko' },
        },
        {
          name: 'X-Client',
          in: 'header',
          required: false,
          schema: { type: 'string', enum: ['ios', 'android', 'admin'] },
        },
      )
      .build();
    SwaggerModule.setup('api-docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    `API on http://localhost:${port}/api  (docs: /api-docs)`,
    'Bootstrap',
  );
}

void bootstrap();
