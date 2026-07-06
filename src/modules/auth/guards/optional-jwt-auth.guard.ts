import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser, JwtPayload } from '../auth.types';

/**
 * Bearer 토큰이 있고 유효하면 `req.user`를 세팅하고, 없거나 무효면 그냥 통과.
 * (인증 실패로 요청을 막지 않는다 — 게스트 허용 조회용.)
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return true;
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      (req as Request & { user: AuthUser }).user = { userId: payload.sub };
    } catch {
      // 무효 토큰은 게스트로 취급 — 통과.
    }
    return true;
  }
}
