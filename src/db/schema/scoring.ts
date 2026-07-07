import { pgTable, text, integer, varchar, numeric } from 'drizzle-orm/pg-core';
import { regions } from './regions';

/** 액션별 기본 점수 (예: CERT_PHOTO=15). place.base_points 미설정(0) 시 fallback. */
export const scoreRules = pgTable('score_rule', {
  action: text('action').primaryKey(),
  basePoints: integer('base_points').notNull(),
});

/** 시·도(PROVINCE) 단위 지역 가중치. 미설정 지역은 1.0으로 취급(행 없음 허용). */
export const regionWeights = pgTable('region_weight', {
  regionCode: varchar('region_code', { length: 10 })
    .primaryKey()
    .references(() => regions.code),
  weight: numeric('weight', { precision: 4, scale: 2 }).notNull().default('1.00'),
});

export type ScoreRule = typeof scoreRules.$inferSelect;
export type RegionWeight = typeof regionWeights.$inferSelect;
