import {
  pgTable,
  uuid,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';

/**
 * 사용자의 여행지 방문(수집) 기록. 한 place당 1행(UNIQUE(user,place)).
 * 사진 인증/점수는 후속 단계에서 이 위에 얹는다(A-min).
 */
export const visits = pgTable(
  'visit',
  {
    id: uuid('id').primaryKey(), // UUIDv7 (IdService)
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userPlaceUq: unique('visit_user_place_uq').on(t.userId, t.placeId),
    userIdx: index('visit_user_idx').on(t.userId),
  }),
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
