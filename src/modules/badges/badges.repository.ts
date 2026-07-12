import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { badges, badgeTrans, userBadges, scoreEvents, visits, type localeEnum } from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class BadgesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 유저의 누적 점수(EXP 원천)와 방문 place 수. */
  async userFacts(userId: string): Promise<{ score: number; visitCount: number }> {
    const [s] = await this.db
      .select({ score: sql<string | null>`coalesce(sum(${scoreEvents.weightedScore}), 0)` })
      .from(scoreEvents)
      .where(eq(scoreEvents.userId, userId));
    const [v] = await this.db
      .select({ count: sql<number>`count(distinct ${visits.placeId})::int` })
      .from(visits)
      .where(eq(visits.userId, userId));
    return { score: Number(s?.score ?? 0), visitCount: Number(v?.count ?? 0) };
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
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(badges.tier), desc(userBadges.earnedAt));
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
}
