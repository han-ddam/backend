import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { localeEnum, userStatusEnum } from './enums';

/**
 * App members — authenticate via social login only (see oauth_identity).
 * No password and no admin role: back-office accounts live in the `admin` table.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // UUIDv7 generated app-side (IdService)
  email: text('email').unique(), // nullable: social provider may not share it
  handle: text('handle').notNull().unique(), // e.g. @seoulriver
  displayName: text('display_name').notNull(),
  locale: localeEnum('locale').notNull().default('KO'),
  status: userStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
