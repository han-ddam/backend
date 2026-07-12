import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { localeEnum, collectionStatusEnum } from './enums';
import { places } from './places';

/** 어드민 큐레이션 테마 컬렉션. 제목/설명은 collection_trans(i18n). */
export const collections = pgTable('collection', {
  id: uuid('id').primaryKey(),
  seq: integer('seq').notNull(),
  status: collectionStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 컬렉션 다국어 텍스트 (KO 폴백). */
export const collectionTrans = pgTable(
  'collection_trans',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.collectionId, t.locale] }) }),
);

/** 컬렉션 소속 장소 (다대다). */
export const collectionPlace = pgTable(
  'collection_place',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.collectionId, t.placeId] }),
    placeIdx: index('collection_place_place_idx').on(t.placeId),
  }),
);

export type Collection = typeof collections.$inferSelect;
export type CollectionTrans = typeof collectionTrans.$inferSelect;
export type CollectionPlace = typeof collectionPlace.$inferSelect;
