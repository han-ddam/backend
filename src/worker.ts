import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Worker entrypoint (BullMQ process). Boots the SAME modules as the API but as
 * an application context with NO HTTP listener — queue processors registered in
 * domain modules come alive here. (queues: ai-verify, ai-illustrate, moderation,
 * image-process, push-batch, ingestion-sync, outbox-relay, trending-snapshot.)
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  Logger.log('Worker process started (BullMQ consumers active)', 'Worker');
}

void bootstrap();
