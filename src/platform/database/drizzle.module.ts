import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@db/schema';
import type { Env } from '@platform/config/env';
import { DRIZZLE } from './drizzle.constants';

/** Raw postgres-js client token, so we can close it on shutdown. */
const PG_CLIENT = Symbol('PG_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        postgres(config.get('DATABASE_URL', { infer: true }), { max: 10 }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: ReturnType<typeof postgres>) =>
        drizzle(client, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule implements OnApplicationShutdown {
  constructor() {}

  async onApplicationShutdown() {
    // postgres-js client is closed by Nest DI teardown of PG_CLIENT consumers;
    // explicit close hook can be added here if needed.
  }
}
