import { pgTable, uuid, text, numeric, timestamp } from 'drizzle-orm/pg-core';

/** 타입별 점수 배수 프로필(어드민). place가 참조. */
export const scoreWeightConfigs = pgTable('score_weight_config', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  visitWeight: numeric('visit_weight', { precision: 4, scale: 2 }).notNull(),
  photoWeight: numeric('photo_weight', { precision: 4, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});

export type ScoreWeightConfig = typeof scoreWeightConfigs.$inferSelect;
