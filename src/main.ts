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
      // context headers exposed in the Authorize dialog (set once, applied to all requests)
      .addApiKey(
        { type: 'apiKey', name: 'Accept-Language', in: 'header' },
        'accept-language',
      )
      .addApiKey({ type: 'apiKey', name: 'X-Client', in: 'header' }, 'x-client')
      .build();

    const document = SwaggerModule.createDocument(app, doc);
    // attach the two context headers to every operation so a value set once in
    // the Authorize dialog is sent on all requests
    const contextSecurity = { 'accept-language': [], 'x-client': [] };
    for (const pathItem of Object.values(document.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const op = pathItem[method];
        if (!op) continue;
        op.security =
          op.security && op.security.length > 0
            ? op.security.map((req) => ({ ...req, ...contextSecurity }))
            : [{ ...contextSecurity }];
      }
    }
    SwaggerModule.setup('api-docs', app, document);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    `API on http://localhost:${port}/api  (docs: /api-docs)`,
    'Bootstrap',
  );
}

void bootstrap();
