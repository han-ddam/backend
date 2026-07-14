import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { badges, badgeTrans, userBadges, scoreEvents, visits, localeEnum } from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class BadgesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 유저의 누적 점수(EXP 원천)와 방문 place 수. */
  async userFacts(userId: string): Promise<{ score: number; visitCount: number }> {
    const [scoreRows, visitRows] = await Promise.all([
      this.db
        .select({ score: sql<string | null>`coalesce(sum(${scoreEvents.weightedScore}), 0)` })
        .from(scoreEvents)
        .where(eq(scoreEvents.userId, userId)),
      this.db
        .select({ count: sql<number>`count(distinct ${visits.placeId})::int` })
        .from(visits)
        .where(eq(visits.userId, userId)),
    ]);
    return { score: Number(scoreRows[0]?.score ?? 0), visitCount: Number(visitRows[0]?.count ?? 0) };
  }

  async activeBadges(): Promise<{ id: string; criteriaType: 'LEVEL' | 'VISIT_COUNT'; criteriaValue: number }[]> {
    return this.db
      .select({ id: badges.id, criteriaType: badges.criteriaType, criteriaValue: badges.criteriaValue })
      .from(badges)
      .where(eq(badges.status, 'ACTIVE'));
  }

  /** 뱃지 부여 — 이미 있으면 무시(멱등). */
  async grantMany(userId: string, badgeIds: string[]): Promise<void> {
    if (badgeIds.length === 0) return;
    await this.db
      .insert(userBadges)
      .values(badgeIds.map((badgeId) => ({ userId, badgeId })))
      .onConflictDoNothing({ target: [userBadges.userId, userBadges.badgeId] });
  }

  /** 내 획득 뱃지 (tier DESC, earned DESC). */
  async earnedBadges(
    userId: string,
  ): Promise<{ badgeId: string; code: string; tier: number; iconKey: string | null; earnedAt: Date }[]> {
    return this.db
      .select({
        badgeId: badges.id,
        code: badges.code,
        tier: badges.tier,
        iconKey: badges.iconKey,
        earnedAt: userBadges.earnedAt,
      })
      .from(userBadges)
      .innerJoin(badges, eq(badges.id, userBadges.badgeId))
      .where(and(eq(userBadges.userId, userId), eq(badges.status, 'ACTIVE')))
      .orderBy(desc(badges.tier), desc(userBadges.earnedAt));
  }

  /** 여러 유저의 획득 뱃지 rows (userId, tier DESC). 대표 뱃지 선택용. */
  async representativeRows(
    userIds: string[],
  ): Promise<{ userId: string; badgeId: string; code: string; tier: number; iconKey: string | null }[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        userId: userBadges.userId,
        badgeId: badges.id,
        code: badges.code,
        tier: badges.tier,
        iconKey: badges.iconKey,
      })
      .from(userBadges)
      .innerJoin(badges, eq(badges.id, userBadges.badgeId))
      .where(and(inArray(userBadges.userId, userIds), eq(badges.status, 'ACTIVE')))
      .orderBy(desc(badges.tier), asc(badges.seq), asc(badges.id));
  }

  async badgeTransFor(
    badgeIds: string[],
    locales: Locale[],
  ): Promise<{ badgeId: string; locale: string; name: string }[]> {
    if (badgeIds.length === 0) return [];
    return this.db
      .select({ badgeId: badgeTrans.badgeId, locale: badgeTrans.locale, name: badgeTrans.name })
      .from(badgeTrans)
      .where(and(inArray(badgeTrans.badgeId, badgeIds), inArray(badgeTrans.locale, locales)));
  }

  async create(
    input: { id: string; code: string; tier: number; criteriaType: 'LEVEL' | 'VISIT_COUNT'; criteriaValue: number; iconKey: string | null; status: 'ACTIVE' | 'HIDDEN'; seq: number },
    trans: { locale: string; name: string; description: string | null }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(badges).values({
        id: input.id, code: input.code, tier: input.tier,
        criteriaType: input.criteriaType, criteriaValue: input.criteriaValue,
        iconKey: input.iconKey, status: input.status, seq: input.seq,
      });
      await tx.insert(badgeTrans).values(
        trans.map((t) => ({ badgeId: input.id, locale: t.locale as Locale, name: t.name, description: t.description })),
      );
    });
  }

  async updateMeta(
    id: string,
    patch: { tier?: number; criteriaValue?: number; iconKey?: string | null; status?: 'ACTIVE' | 'HIDDEN'; seq?: number },
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .update(badges)
      .set({
        ...(patch.tier !== undefined ? { tier: patch.tier } : {}),
        ...(patch.criteriaValue !== undefined ? { criteriaValue: patch.criteriaValue } : {}),
        ...(patch.iconKey !== undefined ? { iconKey: patch.iconKey } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.seq !== undefined ? { seq: patch.seq } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(badges.id, id))
      .returning({ id: badges.id });
    return row ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(badges).where(eq(badges.id, id)).returning({ id: badges.id });
    return rows.length > 0;
  }

  async codeExists(code: string): Promise<boolean> {
    const [row] = await this.db.select({ id: badges.id }).from(badges).where(eq(badges.code, code));
    return !!row;
  }

  async adminListPage(params: { limit: number; offset: number }): Promise<{ rows: { id: string; code: string; tier: number; criteriaType: string; criteriaValue: number; status: string; seq: number }[]; total: number }> {
    const rows = await this.db
      .select({ id: badges.id, code: badges.code, tier: badges.tier, criteriaType: badges.criteriaType, criteriaValue: badges.criteriaValue, status: badges.status, seq: badges.seq })
      .from(badges)
      .orderBy(asc(badges.seq), asc(badges.id))
      .limit(params.limit)
      .offset(params.offset);
    const [{ value }] = await this.db.select({ value: sql<number>`count(*)::int` }).from(badges);
    return { rows, total: Number(value) };
  }
}
