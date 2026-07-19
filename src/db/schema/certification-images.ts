import { pgTable, uuid, text, integer, boolean, unique, index } from 'drizzle-orm/pg-core';
import { certifications } from './certifications';

/** 인증 1건의 사진들(1:N). 정확히 1장이 is_representative=true(커버). */
export const certificationImages = pgTable(
  'certification_image',
  {
    id: uuid('id').primaryKey(),
    certId: uuid('cert_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    imageKey: text('image_key').notNull(),
    seq: integer('seq').notNull(),
    isRepresentative: boolean('is_representative').notNull().default(false),
  },
  (t) => ({
    certSeqUq: unique('cert_image_cert_seq_uq').on(t.certId, t.seq),
    imageKeyUq: unique('cert_image_key_uq').on(t.imageKey),
    certIdx: index('cert_image_cert_idx').on(t.certId),
  }),
);

export type CertificationImage = typeof certificationImages.$inferSelect;
