import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  primaryKey,
  unique,
} from 'drizzle-orm/pg-core';
import { localeEnum } from './enums';
import { users } from './users';

export const agreementTypeEnum = pgEnum('agreement_type', [
  'TOS', // 이용약관
  'PRIVACY', // 개인정보 처리방침
  'CONTENT_LICENSE', // 콘텐츠(사진/그림) 라이선스 — 인증 시점 동의
]);

/**
 * 버전드 약관 문서. 같은 type의 "현재" 버전 = createdAt이 가장 최신인 행.
 * 제목/본문은 agreement_trans(i18n). required=가입/이용에 필수 동의 여부.
 */
export const agreements = pgTable(
  'agreement',
  {
    id: uuid('id').primaryKey(),
    type: agreementTypeEnum('type').notNull(),
    version: text('version').notNull(), // 예: "1.0"
    required: boolean('required').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({ typeVersion: unique('agreement_type_version_uq').on(t.type, t.version) }),
);

/** 약관 다국어 제목/본문 (KO 폴백). */
export const agreementTrans = pgTable(
  'agreement_trans',
  {
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agreementId, t.locale] }) }),
);

/** 동의 원장: 어떤 회원이 어떤 약관(버전)에 언제 동의했는지. 버전당 1회. */
export const userAgreements = pgTable(
  'user_agreement',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agreementId: uuid('agreement_id')
      .notNull()
      .references(() => agreements.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userAgreementUq: unique('user_agreement_uq').on(t.userId, t.agreementId),
  }),
);

export type Agreement = typeof agreements.$inferSelect;
export type AgreementTrans = typeof agreementTrans.$inferSelect;
export type UserAgreement = typeof userAgreements.$inferSelect;
