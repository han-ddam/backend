import type { AdminRole } from '@db/schema';

/** Decoded admin JWT payload (typ distinguishes it from member tokens). */
export interface AdminJwtPayload {
  sub: string;
  role: AdminRole;
  typ: 'admin';
}

/** The authenticated admin attached to the request by AdminJwtGuard. */
export interface CurrentAdminInfo {
  adminId: string;
  role: AdminRole;
}
