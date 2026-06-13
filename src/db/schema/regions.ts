import { pgTable, varchar, text, boolean } from 'drizzle-orm/pg-core';
import { geometryMultiPolygon } from '@db/columns';

/**
 * 시·군·구 (228 administrative regions). The `boundary` column needs a GIST index
 * for point-in-polygon containment — added via hand-authored SQL migration, NOT
 * inferred by drizzle-kit (see 02-design.md §3.6).
 */
export const regions = pgTable('region', {
  code: varchar('code', { length: 10 }).primaryKey(), // 행정구역 code
  nameKo: text('name_ko').notNull(),
  nameEn: text('name_en'),
  nameJa: text('name_ja'),
  nameZh: text('name_zh'),
  parentCode: varchar('parent_code', { length: 10 }),
  boundary: geometryMultiPolygon('boundary'),
  // Denormalized convenience; source of truth for the weight is the policy table.
  isDecliningPop: boolean('is_declining_pop').notNull().default(false),
});

export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;
