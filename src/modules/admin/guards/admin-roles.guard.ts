import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AdminRole } from '@db/schema';
import type { CurrentAdminInfo } from '../admin.types';
import { ADMIN_ROLES_KEY } from '../decorators/admin-roles.decorator';

/** Enforces @AdminRoles(...) metadata. Must run after AdminJwtGuard. */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { admin?: CurrentAdminInfo }>();
    if (!req.admin || !required.includes(req.admin.role)) {
      throw new ForbiddenException('Insufficient admin role');
    }
    return true;
  }
}
