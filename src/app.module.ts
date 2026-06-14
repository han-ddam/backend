import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PlatformModule } from '@platform/platform.module';
import { RequestContextMiddleware } from '@platform/context/request-context.middleware';
import { HealthModule } from '@modules/health/health.module';
import { GeoModule } from '@modules/geo/geo.module';
import { UsersModule } from '@modules/users/users.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AdminModule } from '@modules/admin/admin.module';

/**
 * Root composition. PlatformModule (global) provides infra to every domain
 * module. Domain modules are added here as they are built — see README roadmap.
 * The same AppModule backs BOTH entrypoints: main.ts (HTTP) and worker.ts (BullMQ).
 */
@Module({
  imports: [
    // global rate limit: 100 requests / 60s per IP (auth routes override stricter)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PlatformModule,
    HealthModule,
    GeoModule,
    UsersModule,
    AuthModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
