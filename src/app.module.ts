import { Module } from '@nestjs/common';
import { PlatformModule } from '@platform/platform.module';
import { HealthModule } from '@modules/health/health.module';
import { GeoModule } from '@modules/geo/geo.module';
import { UsersModule } from '@modules/users/users.module';
import { AuthModule } from '@modules/auth/auth.module';

/**
 * Root composition. PlatformModule (global) provides infra to every domain
 * module. Domain modules are added here as they are built — see README roadmap.
 * The same AppModule backs BOTH entrypoints: main.ts (HTTP) and worker.ts (BullMQ).
 */
@Module({
  imports: [
    PlatformModule,
    HealthModule,
    GeoModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
