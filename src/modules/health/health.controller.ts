import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { REDIS } from '@platform/redis/redis.module';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness + dependency check: DB reachable, PostGIS present, Redis up. */
  @Get()
  async check() {
    const [{ version }] = await this.db.execute<{ version: string }>(
      sql`SELECT postgis_version() AS version`,
    );
    const redisPong = await this.redis.ping();
    return {
      status: 'ok',
      db: 'up',
      postgis: version,
      redis: redisPong === 'PONG' ? 'up' : 'down',
    };
  }
}
