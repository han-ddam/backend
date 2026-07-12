import { pgEnum } from 'drizzle-orm/pg-core';

export const localeEnum = pgEnum('locale', ['KO', 'EN', 'JA', 'ZH']);

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);

// 행정구역 단계 (국제 통용 용어). PROVINCE=시·도, DISTRICT=시·군·구
export const regionLevelEnum = pgEnum('region_level', ['PROVINCE', 'DISTRICT']);

// Deprecated: members no longer carry roles (admins are a separate table).
// Kept defined so the migration treats admin_role as a new enum, not a rename.
// Can be dropped in a later migration.
export const userRoleEnum = pgEnum('user_role', [
  'USER',
  'CURATOR',
  'MODERATOR',
  'ADMIN',
]);

export const collectionStatusEnum = pgEnum('collection_status', ['ACTIVE', 'HIDDEN']);
