import {
  pgTable,
  varchar,
  text,
  boolean,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { geometryMultiPolygon } from '@db/columns';
import { localeEnum } from './enums';

/**
 * 시·도 / 시·군·구 — language-neutral. Names live in `region_i18n`.
 * `boundary` needs a GIST index (hand-authored SQL migration, see 02-design.md §3.6).
 */
export const regions = pgTable('region', {
  code: varchar('code', { length: 10 }).primaryKey(), // areaCode or `${areaCode}_${sigungu}`
  parentCode: varchar('parent_code', { length: 10 }), // 상위 시·도 (시·도는 null)
  boundary: geometryMultiPolygon('boundary'),
  // Denormalized convenience; source of truth for the weight is the policy table.
  isDecliningPop: boolean('is_declining_pop').notNull().default(false),
});

/** Per-locale region names (KO/EN/JA/ZH). KO is the fallback. */
export const regionI18n = pgTable(
  'region_i18n',
  {
    regionCode: varchar('region_code', { length: 10 })
      .notNull()
      .references(() => regions.code, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    name: text('name').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.regionCode, t.locale] }),
  }),
);

export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;
export type RegionI18n = typeof regionI18n.$inferSelect;
