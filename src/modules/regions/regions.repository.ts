import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { decodeCursor } from '@platform/pagination/cursor';
import { regions, regionTrans, places, placeTrans, visits, userPlaceBookmarks, type localeEnum } from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class RegionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findProvince(code: string): Promise<{ code: string } | undefined> {
    const [row] = await this.db
      .select({ code: regions.code })
      .from(regions)
      .where(and(eq(regions.code, code), eq(regions.level, 'PROVINCE')));
    return row;
  }

  /** PROVINCE 전체 + 요청 locale/KO 이름 행 (시·도 코드표). */
  async listProvinces(
    locales: Locale[],
  ): Promise<{ code: string; locale: string; name: string }[]> {
    return this.db
      .select({ code: regions.code, locale: regionTrans.locale, name: regionTrans.name })
      .from(regions)
      .innerJoin(regionTrans, eq(regionTrans.regionCode, regions.code))
      .where(and(eq(regions.level, 'PROVINCE'), inArray(regionTrans.locale, locales)));
  }

  async regionNames(
    code: string,
    locales: Locale[],
  ): Promise<{ locale: string; name: string }[]> {
    return this.db
      .select({ locale: regionTrans.locale, name: regionTrans.name })
      .from(regionTrans)
      .where(and(eq(regionTrans.regionCode, code), inArray(regionTrans.locale, locales)));
  }

  async countPlaces(code: string): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(places)
      .where(and(like(places.regionCode, `${code}\\_%`), eq(places.status, 'ACTIVE')));
    return Number(value);
  }

  async countVisited(userId: string, code: string): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: sql<number>`count(distinct ${visits.placeId})::int` })
      .from(visits)
      .innerJoin(places, eq(places.id, visits.placeId))
      .where(
        and(
          eq(visits.userId, userId),
          like(places.regionCode, `${code}\\_%`),
          eq(places.status, 'ACTIVE'),
        ),
      );
    return Number(value);
  }

  /** 지역 내 찜·미방문 수. */
  async countPlanned(userId: string, code: string): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(userPlaceBookmarks)
      .innerJoin(places, eq(places.id, userPlaceBookmarks.placeId))
      .where(
        and(
          eq(userPlaceBookmarks.userId, userId),
          like(places.regionCode, `${code}\\_%`),
          eq(places.status, 'ACTIVE'),
          sql`not exists (select 1 from ${visits} v where v.place_id = ${places.id} and v.user_id = ${userId})`,
        ),
      );
    return Number(value);
  }

  async listPlaces(p: {
    code: string;
    userId: string | null;
    status: 'ALL' | 'VISITED' | 'PLANNED';
    limit: number;
    cursor?: string;
  }): Promise<Array<{ id: string; createdAt: Date; visited: boolean; bookmarked: boolean; imageUrl: string | null }>> {
    const c = decodeCursor(p.cursor);
    const conds: SQL[] = [
      like(places.regionCode, `${p.code}\\_%`),
      eq(places.status, 'ACTIVE'),
    ];
    if (c) {
      conds.push(
        or(
          lt(places.createdAt, c.createdAt),
          and(eq(places.createdAt, c.createdAt), lt(places.id, c.id)),
        )!,
      );
    }

    if (!p.userId) {
      // 게스트: 방문·찜 0. (status VISITED/PLANNED는 서비스가 사전 차단 → 여기선 ALL만 도달.)
      return this.db
        .select({
          id: places.id,
          createdAt: places.createdAt,
          visited: sql<boolean>`false`,
          bookmarked: sql<boolean>`false`,
          imageUrl: places.imageUrl,
        })
        .from(places)
        .where(and(...conds))
        .orderBy(desc(places.createdAt), desc(places.id))
        .limit(p.limit + 1);
    }

    if (p.status === 'VISITED') conds.push(sql`${visits.id} is not null`);
    if (p.status === 'PLANNED') {
      conds.push(sql`${userPlaceBookmarks.placeId} is not null and ${visits.id} is null`);
    }
    return this.db
      .select({
        id: places.id,
        createdAt: places.createdAt,
        visited: sql<boolean>`${visits.id} is not null`,
        bookmarked: sql<boolean>`${userPlaceBookmarks.placeId} is not null`,
        imageUrl: places.imageUrl,
      })
      .from(places)
      .leftJoin(visits, and(eq(visits.placeId, places.id), eq(visits.userId, p.userId)))
      .leftJoin(
        userPlaceBookmarks,
        and(eq(userPlaceBookmarks.placeId, places.id), eq(userPlaceBookmarks.userId, p.userId)),
      )
      .where(and(...conds))
      .orderBy(desc(places.createdAt), desc(places.id))
      .limit(p.limit + 1);
  }

  async placeTransForMany(
    placeIds: string[],
    locales: Locale[],
  ): Promise<{ placeId: string; locale: string; name: string; address: string | null }[]> {
    if (placeIds.length === 0) return [];
    return this.db
      .select({
        placeId: placeTrans.placeId,
        locale: placeTrans.locale,
        name: placeTrans.name,
        address: placeTrans.address,
      })
      .from(placeTrans)
      .where(and(inArray(placeTrans.placeId, placeIds), inArray(placeTrans.locale, locales)));
  }

  async listRecommended(p: {
    code: string;
    userId: string | null;
    limit: number;
  }): Promise<{ id: string; imageUrl: string | null }[]> {
    const conds: SQL[] = [
      like(places.regionCode, `${p.code}\\_%`),
      eq(places.status, 'ACTIVE'),
    ];
    if (p.userId) {
      conds.push(
        sql`not exists (select 1 from ${visits} v where v.place_id = ${places.id} and v.user_id = ${p.userId})`,
      );
    }
    return this.db
      .select({ id: places.id, imageUrl: places.imageUrl })
      .from(places)
      .where(and(...conds))
      .orderBy(desc(places.basePoints), desc(places.id))
      .limit(p.limit);
  }
}
