import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { DrizzleModule } from './database/drizzle.module';
import { RedisModule } from './redis/redis.module';
import { IdService } from './id/id.service';
import { ClockService } from './clock/clock.service';
import { ResponseHeadersInterceptor } from './http/response-headers.interceptor';

/**
 * Cross-cutting infrastructure injected everywhere. Holds NO domain logic.
 * Exposes: validated config (ConfigService), DRIZZLE, REDIS, IdService, ClockService.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
    DrizzleModule,
    RedisModule,
  ],
  providers: [
    IdService,
    ClockService,
    { provide: APP_INTERCEPTOR, useClass: ResponseHeadersInterceptor },
  ],
  exports: [ConfigModule, DrizzleModule, RedisModule, IdService, ClockService],
})
export class PlatformModule {}
