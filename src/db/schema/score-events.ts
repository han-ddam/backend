import { pgTable, pgEnum, uuid, integer, numeric, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';
import { certifications } from './certifications';

export const scoreEventTypeEnum = pgEnum('score_event_type', ['VISIT', 'PHOTO']);

/** 점수 원장(SSOT). 인증당 1건(unique cert). 재방문은 다건 허용(user,place unique 없음). */
export const scoreEvents = pgTable(
  'score_event',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
    certificationId: uuid('certification_id').notNull().references(() => certifications.id, { onDelete: 'cascade' }),
    type: scoreEventTypeEnum('type').notNull(),
    basePoints: integer('base_points').notNull(),
    regionWeight: numeric('region_weight', { precision: 4, scale: 2 }).notNull(),
    rarityWeight: numeric('rarity_weight', { precision: 4, scale: 2 }).notNull(),
    eventMultiplier: numeric('event_multiplier', { precision: 4, scale: 2 }).notNull(),
    weightedScore: numeric('weighted_score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    certUq: unique('score_event_cert_uq').on(t.certificationId),
  }),
);

export type ScoreEvent = typeof scoreEvents.$inferSelect;
