import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@platform/config/env';
import { UsersModule } from '@modules/users/users.module';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminTokenService } from './tokens/admin-token.service';
import { LoginThrottleService } from './login-throttle.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminController } from './admin.controller';
import { MembersController } from './members.controller';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
          algorithm: 'HS256',
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AdminAuthController, AdminController, MembersController],
  providers: [
    AdminRepository,
    AdminService,
    AdminAuthService,
    AdminTokenService,
    LoginThrottleService,
    AdminJwtGuard,
    AdminRolesGuard,
  ],
  exports: [AdminJwtGuard, AdminRolesGuard, JwtModule],
})
export class AdminModule {}
