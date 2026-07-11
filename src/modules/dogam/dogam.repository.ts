import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { decodeCursor } from '@platform/pagination/cursor';
import { places, visits, regions, placeTrans, certifications, type localeEnum } from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class DogamRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 전국 ACTIVE place 수 + 내 방문 distinct ACTIVE place 수. */
  async overview(userId: string): Promise<{ collected: number; total: number }> {
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(places)
      .where(eq(places.status, 'ACTIVE'));
    const [{ collected }] = await this.db
      .select({ collected: sql<number>`count(distinct ${visits.placeId})::int` })
      .from(visits)
      .innerJoin(places, eq(places.id, visits.placeId))
      .where(and(eq(visits.userId, userId), eq(places.status, 'ACTIVE')));
    return { collected: Number(collected), total: Number(total) };
  }

  /** 시·도(parent_code)별 ACTIVE place 수. */
  async regionTotals(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ province: regions.parentCode, total: sql<number>`count(*)::int` })
      .from(places)
      .innerJoin(regions, eq(regions.code, places.regionCode))
      .where(eq(places.status, 'ACTIVE'))
      .groupBy(regions.parentCode);
    const m = new Map<string, number>();
    for (const r of rows) if (r.province) m.set(r.province, Number(r.total));
    return m;
  }

  /** 시·도(parent_code)별 내 방문 distinct place 수. */
  async regionVisited(userId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ province: regions.parentCode, collected: sql<number>`count(distinct ${places.id})::int` })
      .from(visits)
      .innerJoin(places, eq(places.id, visits.placeId))
      .innerJoin(regions, eq(regions.code, places.regionCode))
      .where(and(eq(visits.userId, userId), eq(places.status, 'ACTIVE')))
      .groupBy(regions.parentCode);
    const m = new Map<string, number>();
    for (const r of rows) if (r.province) m.set(r.province, Number(r.collected));
    return m;
  }

  /** 내 visit을 createdAt DESC, id DESC 커서로 limit+1개. */
  async recentVisitsPage(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ id: string; createdAt: Date; placeId: string }[]> {
    const c = decodeCursor(cursor);
    const conds: SQL[] = [eq(visits.userId, userId)];
    if (c) {
      conds.push(
        or(
          lt(visits.createdAt, c.createdAt),
          and(eq(visits.createdAt, c.createdAt), lt(visits.id, c.id)),
        )!,
      );
    }
    return this.db
      .select({ id: visits.id, createdAt: visits.createdAt, placeId: visits.placeId })
      .from(visits)
      .where(and(...conds))
      .orderBy(desc(visits.createdAt), desc(visits.id))
      .limit(limit + 1);
  }

  async placeNames(
    placeIds: string[],
    locales: Locale[],
  ): Promise<{ placeId: string; locale: string; name: string }[]> {
    if (placeIds.length === 0) return [];
    return this.db
      .select({ placeId: placeTrans.placeId, locale: placeTrans.locale, name: placeTrans.name })
      .from(placeTrans)
      .where(and(inArray(placeTrans.placeId, placeIds), inArray(placeTrans.locale, locales)));
  }

  /** (user,place)별 최신 ACCEPTED 인증의 image_key. */
  async certImagesFor(
    userId: string,
    placeIds: string[],
  ): Promise<{ placeId: string; imageKey: string }[]> {
    if (placeIds.length === 0) return [];
    return this.db
      .selectDistinctOn([certifications.placeId], {
        placeId: certifications.placeId,
        imageKey: certifications.imageKey,
      })
      .from(certifications)
      .where(
        and(
          eq(certifications.userId, userId),
          inArray(certifications.placeId, placeIds),
          eq(certifications.status, 'ACCEPTED'),
        ),
      )
      .orderBy(certifications.placeId, desc(certifications.createdAt), desc(certifications.id));
  }
}
