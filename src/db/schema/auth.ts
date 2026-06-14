import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const authProviderEnum = pgEnum('auth_provider', [
  'KAKAO',
  'NAVER',
  'GOOGLE',
]);

/**
 * Links an external social identity (Kakao/Naver) to a canonical user.
 * One user may have multiple identities (e.g. both Kakao and Naver).
 */
export const oauthIdentity = pgTable(
  'oauth_identity',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    providerUnique: unique('oauth_identity_provider_uid_unique').on(
      t.provider,
      t.providerUserId,
    ),
  }),
);

/**
 * Opaque refresh tokens, stored as a SHA-256 hash (never the raw value).
 * Rotated on every refresh; revoked on logout.
 */
export const refreshTokens = pgTable('refresh_token', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OAuthIdentity = typeof oauthIdentity.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
