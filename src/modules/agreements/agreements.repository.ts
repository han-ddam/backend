import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  agreements,
  agreementTrans,
  userAgreements,
  type Agreement,
  type AgreementTrans,
  type localeEnum,
  type agreementTypeEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];
type AgreementType = (typeof agreementTypeEnum.enumValues)[number];

export interface ConsentRow {
  agreementId: string;
  type: AgreementType;
  version: string;
  acceptedAt: Date;
}

@Injectable()
export class AgreementsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 같은 type의 "현재" 약관 = createdAt 최신 1건. */
  async findCurrent(type: AgreementType): Promise<Agreement | undefined> {
    const [row] = await this.db
      .select()
      .from(agreements)
      .where(eq(agreements.type, type))
      .orderBy(desc(agreements.createdAt))
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<Agreement | undefined> {
    const [row] = await this.db
      .select()
      .from(agreements)
      .where(eq(agreements.id, id));
    return row;
  }

  /** 약관 다국어 행 (caller가 locale/KO 폴백 선택). */
  async transFor(
    agreementId: string,
    locales: Locale[],
  ): Promise<AgreementTrans[]> {
    return this.db
      .select()
      .from(agreementTrans)
      .where(
        and(
          eq(agreementTrans.agreementId, agreementId),
          inArray(agreementTrans.locale, locales),
        ),
      );
  }

  /** 동의 기록 (버전당 1회 — 중복은 무시). 새로 기록되면 true. */
  async recordConsent(input: {
    id: string;
    userId: string;
    agreementId: string;
  }): Promise<boolean> {
    const inserted = await this.db
      .insert(userAgreements)
      .values({
        id: input.id,
        userId: input.userId,
        agreementId: input.agreementId,
      })
      .onConflictDoNothing({
        target: [userAgreements.userId, userAgreements.agreementId],
      })
      .returning({ id: userAgreements.id });
    return inserted.length > 0;
  }

  /** 내 동의 이력 (약관 메타 조인), 최신순. */
  async listConsents(userId: string): Promise<ConsentRow[]> {
    return this.db
      .select({
        agreementId: agreements.id,
        type: agreements.type,
        version: agreements.version,
        acceptedAt: userAgreements.acceptedAt,
      })
      .from(userAgreements)
      .innerJoin(agreements, eq(userAgreements.agreementId, agreements.id))
      .where(eq(userAgreements.userId, userId))
      .orderBy(desc(userAgreements.acceptedAt));
  }
}
