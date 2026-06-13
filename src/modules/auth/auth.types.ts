import type { User } from '@db/schema';

/** Decoded JWT payload. */
export interface JwtPayload {
  sub: string;
  role: User['role'];
}

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  role: User['role'];
}
