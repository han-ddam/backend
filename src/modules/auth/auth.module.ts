import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@platform/config/env';
import { UsersModule } from '@modules/users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from './tokens/token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { KAKAO_OAUTH, NAVER_OAUTH } from './oauth/oauth.port';
import { KakaoOAuthAdapter } from './oauth/kakao.adapter';
import { NaverOAuthAdapter } from './oauth/naver.adapter';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
    { provide: KAKAO_OAUTH, useClass: KakaoOAuthAdapter },
    { provide: NAVER_OAUTH, useClass: NaverOAuthAdapter },
  ],
  exports: [JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
