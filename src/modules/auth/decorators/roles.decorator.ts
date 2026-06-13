import { SetMetadata } from '@nestjs/common';
import type { User } from '@db/schema';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given roles (use together with JwtAuthGuard + RolesGuard). */
export const Roles = (...roles: User['role'][]) => SetMetadata(ROLES_KEY, roles);
