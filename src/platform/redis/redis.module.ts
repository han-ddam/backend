import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '@platform/config/env';

/** Injection token for the shared ioredis client. */
export const REDIS = Symbol('REDIS');

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: null, // required for BullMQ compatibility
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
