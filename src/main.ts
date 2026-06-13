import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe } from 'nestjs-zod';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import type { Env } from '@platform/config/env';

/** HTTP entrypoint (API process). */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe()); // zod-based, from nestjs-zod
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
