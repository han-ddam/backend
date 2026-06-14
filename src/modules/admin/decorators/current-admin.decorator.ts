import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentAdminInfo } from '../admin.types';

/** Injects the authenticated admin (set by AdminJwtGuard). */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentAdminInfo => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { admin: CurrentAdminInfo }>();
    return req.admin;
  },
);
