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
import { ResponseInterceptor } from '@platform/http/response.interceptor';
import { AllExceptionsFilter } from '@platform/http/all-exceptions.filter';

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
  // envelope: 성공 { result, error:null } / 실패 { result:null, error }
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  // --- API docs (Swagger) — off in production unless ENABLE_SWAGGER=1 ---
  const swaggerEnabled =
    config.get('NODE_ENV', { infer: true }) !== 'production' ||
    config.get('ENABLE_SWAGGER', { infer: true });
  if (swaggerEnabled) {
    patchNestJsSwagger(); // makes zod DTOs emit OpenAPI schemas
    const doc = new DocumentBuilder()
      .setTitle('한땀 API')
      .setDescription(
        '한땀 백엔드 API 문서. 모든 응답은 { result, error } 로 감쌈 — ' +
          '성공: { result:<payload>, error:null }, 실패: { result:null, error:{ code, message } }.',
      )
      .setVersion('0.1')
      .addBearerAuth() // JWT access token (member & admin)
      // Accept-Language exposed in the Authorize dialog (set once, applied to all requests)
      .addApiKey(
        { type: 'apiKey', name: 'Accept-Language', in: 'header' },
        'accept-language',
      )
      .build();

    const document = SwaggerModule.createDocument(app, doc);
    // attach Accept-Language to every operation so a value set once in
    // the Authorize dialog is sent on all requests
    const contextSecurity = { 'accept-language': [] };
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
