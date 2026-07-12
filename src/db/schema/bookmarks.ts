import { pgTable, uuid, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';

/** 사용자의 여행지 찜(방문예정). 1인 1place 1행. PLANNED = 찜 && 미방문. */
export const userPlaceBookmarks = pgTable(
  'user_place_bookmark',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.placeId] }),
    placeIdx: index('user_place_bookmark_place_idx').on(t.placeId),
  }),
);

export type UserPlaceBookmark = typeof userPlaceBookmarks.$inferSelect;
