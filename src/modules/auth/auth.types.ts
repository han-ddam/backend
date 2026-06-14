/** Decoded member JWT payload. */
export interface JwtPayload {
  sub: string;
}

/** The authenticated member attached to the request by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
}
