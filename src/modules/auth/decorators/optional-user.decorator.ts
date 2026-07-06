import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth.types';

/** OptionalJwtAuthGuard가 세팅한 유저(없으면 null). */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    return req.user ?? null;
  },
);
