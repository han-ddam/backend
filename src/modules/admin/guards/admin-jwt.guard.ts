import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AdminJwtPayload, CurrentAdminInfo } from '../admin.types';

/** Verifies the admin Bearer token (must carry `typ: 'admin'`). */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const payload = await this.jwt.verifyAsync<AdminJwtPayload>(
        header.slice(7),
      );
      if (payload.typ !== 'admin') {
        throw new UnauthorizedException('Not an admin token');
      }
      const admin: CurrentAdminInfo = {
        adminId: payload.sub,
        role: payload.role,
      };
      (req as Request & { admin: CurrentAdminInfo }).admin = admin;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
