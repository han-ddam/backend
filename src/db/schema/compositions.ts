import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  text,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { localeEnum } from './enums';
import { places } from './places';

export const compositionSourceEnum = pgEnum('composition_source', ['CURATED', 'AI']);

/** 여행지 촬영 구도 가이드(큐레이터 등록). 설명/제목은 place_composition_trans(i18n). */
export const placeCompositions = pgTable(
  'place_composition',
  {
    id: uuid('id').primaryKey(),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    source: compositionSourceEnum('source').notNull().default('CURATED'),
    exampleImageKey: text('example_image_key'), // StoragePort 키(없으면 null)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ placeIdx: index('place_composition_place_idx').on(t.placeId) }),
);

/** 구도 다국어 텍스트 (KO 폴백). */
export const placeCompositionTrans = pgTable(
  'place_composition_trans',
  {
    compositionId: uuid('composition_id')
      .notNull()
      .references(() => placeCompositions.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.compositionId, t.locale] }) }),
);

export type PlaceComposition = typeof placeCompositions.$inferSelect;
export type PlaceCompositionTrans = typeof placeCompositionTrans.$inferSelect;
