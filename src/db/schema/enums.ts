import { pgEnum } from 'drizzle-orm/pg-core';

export const localeEnum = pgEnum('locale', ['KO', 'EN', 'JA', 'ZH']);

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);

// Deprecated: members no longer carry roles (admins are a separate table).
// Kept defined so the migration treats admin_role as a new enum, not a rename.
// Can be dropped in a later migration.
export const userRoleEnum = pgEnum('user_role', [
  'USER',
  'CURATOR',
  'MODERATOR',
  'ADMIN',
]);
