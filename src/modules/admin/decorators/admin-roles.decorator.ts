import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '@db/schema';

export const ADMIN_ROLES_KEY = 'admin_roles';

/** Restrict an admin route to the given admin roles (use with AdminRolesGuard). */
export const AdminRoles = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);
