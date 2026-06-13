import { pgEnum } from 'drizzle-orm/pg-core';

export const localeEnum = pgEnum('locale', ['KO', 'EN', 'JA', 'ZH']);
export const userRoleEnum = pgEnum('user_role', [
  'USER',
  'CURATOR',
  'MODERATOR',
  'ADMIN',
]);
