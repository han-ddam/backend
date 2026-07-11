import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  numeric,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';

export const certStatusEnum = pgEnum('certification_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
]);
export const certVisibilityEnum = pgEnum('certification_visibility', [
  'PRIVATE',
  'PUBLIC',
]);

/**
 * 방문 인증 기록. GPS 좌표는 저장하지 않고(위치정보법) 근접 통과여부/거리만 남긴다.
 * 실제 점수 적립은 score_event(원장)에서, 이 테이블은 인증 시도의 감사 기록.
 */
export const certifications = pgTable(
  'certification',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    imageKey: text('image_key').notNull(), // StoragePort가 반환한 키
    caption: text('caption'),
    visibility: certVisibilityEnum('visibility').notNull().default('PRIVATE'),
    status: certStatusEnum('status').notNull().default('PENDING'),
    proximityPass: boolean('proximity_pass').notNull(),
    proximityDistanceM: numeric('proximity_distance_m'), // 좌표 아님, 거리만
    rejectReason: text('reject_reason'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userImageUq: unique('cert_user_image_uq').on(t.userId, t.imageKey),
    userIdx: index('cert_user_idx').on(t.userId),
  }),
);

export type Certification = typeof certifications.$inferSelect;
