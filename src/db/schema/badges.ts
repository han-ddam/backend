import { pgTable, uuid, text, integer, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { localeEnum, badgeCriteriaTypeEnum, badgeStatusEnum } from './enums';
import { users } from './users';

/** 뱃지 카탈로그 + 획득 정책. 이름/설명은 badge_trans(i18n). */
export const badges = pgTable('badge', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  tier: integer('tier').notNull(), // 대표 뱃지 선택용(높을수록 상위)
  criteriaType: badgeCriteriaTypeEnum('criteria_type').notNull(),
  criteriaValue: integer('criteria_value').notNull(),
  iconKey: text('icon_key'),
  status: badgeStatusEnum('status').notNull().default('ACTIVE'),
  seq: integer('seq').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const badgeTrans = pgTable(
  'badge_trans',
  {
    badgeId: uuid('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.badgeId, t.locale] }) }),
);

/** 유저 획득 뱃지. */
export const userBadges = pgTable(
  'user_badge',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid('badge_id').notNull().references(() => badges.id, { onDelete: 'cascade' }),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.badgeId] }),
    userIdx: index('user_badge_user_idx').on(t.userId),
  }),
);

export type Badge = typeof badges.$inferSelect;
export type BadgeTrans = typeof badgeTrans.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
