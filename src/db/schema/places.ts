import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  doublePrecision,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { localeEnum } from './enums';
import { regions } from './regions';

export const placeStatusEnum = pgEnum('place_status', ['ACTIVE', 'HIDDEN']);

/**
 * 여행지(관광지). TourAPI 관광지(type 12)에서 어드민이 큐레이션 등록.
 * 이름/주소/설명/미션은 place_trans(i18n). 점수값(base_points·rarity_weight)은 어드민 수동.
 */
export const places = pgTable('place', {
  id: uuid('id').primaryKey(),
  regionCode: varchar('region_code', { length: 10 })
    .notNull()
    .references(() => regions.code), // 시·군·구(DISTRICT) 코드
  tourapiContentId: text('tourapi_content_id').unique(), // 출처 연결(nullable)
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  basePoints: integer('base_points').notNull().default(0),
  rarityWeight: numeric('rarity_weight', { precision: 4, scale: 2 })
    .notNull()
    .default('1.00'),
  tags: text('tags').array().notNull().default([]),
  status: placeStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 여행지 다국어 텍스트 (KO 폴백). */
export const placeTrans = pgTable(
  'place_trans',
  {
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    name: text('name').notNull(),
    address: text('address'),
    description: text('description'),
    mission: text('mission'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.placeId, t.locale] }) }),
);

export type Place = typeof places.$inferSelect;
export type PlaceTrans = typeof placeTrans.$inferSelect;
