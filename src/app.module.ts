import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type { Redis } from 'ioredis';
import { PlatformModule } from '@platform/platform.module';
import { REDIS } from '@platform/redis/redis.module';
import { RequestContextMiddleware } from '@platform/context/request-context.middleware';
import { HealthModule } from '@modules/health/health.module';
import { GeoModule } from '@modules/geo/geo.module';
import { UsersModule } from '@modules/users/users.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AdminModule } from '@modules/admin/admin.module';
import { PlacesModule } from '@modules/places/places.module';
import { VisitsModule } from '@modules/visits/visits.module';
import { RegionsModule } from '@modules/regions/regions.module';
import { ScoringModule } from '@modules/scoring/scoring.module';
import { AgreementsModule } from '@modules/agreements/agreements.module';

/**
 * Root composition. PlatformModule (global) provides infra to every domain
 * module. Domain modules are added here as they are built — see README roadmap.
 * The same AppModule backs BOTH entrypoints: main.ts (HTTP) and worker.ts (BullMQ).
 */
@Module({
  imports: [
    // global rate limit: 100 requests / 60s per IP (auth routes override stricter).
    // Redis-backed so limits are shared across all server instances.
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
    PlatformModule,
    HealthModule,
    GeoModule,
    UsersModule,
    AuthModule,
    AdminModule,
    PlacesModule,
    VisitsModule,
    RegionsModule,
    ScoringModule,
    AgreementsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
