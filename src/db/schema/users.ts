import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { localeEnum, userRoleEnum } from './enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // UUIDv7 generated app-side (IdService)
  // email is nullable: social users may not consent to share it, and there is NO
  // public email signup. password_hash is nullable: only admin-created accounts
  // (staff) have a password; social users authenticate via oauth_identity.
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  handle: text('handle').notNull().unique(), // e.g. @seoulriver
  displayName: text('display_name').notNull(),
  role: userRoleEnum('role').notNull().default('USER'),
  locale: localeEnum('locale').notNull().default('KO'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
