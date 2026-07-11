import { pgTable, uuid, integer, numeric, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';
import { certifications } from './certifications';

/**
 * 점수 원장(SSOT). 랭킹/진행도는 이 원장의 프로젝션. (user,place)당 1건 = 첫 수집만 적립.
 */
export const scoreEvents = pgTable(
  'score_event',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    certificationId: uuid('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    basePoints: integer('base_points').notNull(),
    regionWeight: numeric('region_weight', { precision: 4, scale: 2 }).notNull(),
    rarityWeight: numeric('rarity_weight', { precision: 4, scale: 2 }).notNull(),
    eventMultiplier: numeric('event_multiplier', { precision: 4, scale: 2 }).notNull(),
    weightedScore: numeric('weighted_score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    certUq: unique('score_event_cert_uq').on(t.certificationId),
    userPlaceUq: unique('score_event_user_place_uq').on(t.userId, t.placeId),
  }),
);

export type ScoreEvent = typeof scoreEvents.$inferSelect;
