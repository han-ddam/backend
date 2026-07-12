import { pgTable, uuid, numeric, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';

/** 여행자 별점 (user↔place, 1인 1place 1행). rating 집계는 이 테이블에서 파생. */
export const placeRatings = pgTable(
  'place_rating',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 2, scale: 1 }).notNull(), // 0.5~5.0, 0.5 단위
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.placeId] }),
    placeIdx: index('place_rating_place_idx').on(t.placeId),
  }),
);

export type PlaceRating = typeof placeRatings.$inferSelect;
