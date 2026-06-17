import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@platform/config/env';
import { UsersModule } from '@modules/users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from './tokens/token.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { KAKAO_OAUTH, NAVER_OAUTH, GOOGLE_OAUTH } from './oauth/oauth.port';
import { KakaoOAuthAdapter } from './oauth/kakao.adapter';
import { NaverOAuthAdapter } from './oauth/naver.adapter';
import { GoogleOAuthAdapter } from './oauth/google.adapter';

/** Member authentication (social login). */
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        // pin the algorithm to prevent algorithm-confusion attacks
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }),
          algorithm: 'HS256',
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    { provide: KAKAO_OAUTH, useClass: KakaoOAuthAdapter },
    { provide: NAVER_OAUTH, useClass: NaverOAuthAdapter },
    { provide: GOOGLE_OAUTH, useClass: GoogleOAuthAdapter },
  ],
  // JwtModule도 export → 다른 모듈이 JwtAuthGuard 사용 시 JwtService 해석 가능
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
