import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { places, visits, placeTrans, type localeEnum } from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class HomeRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 미방문 ACTIVE 장소, 오늘 날짜 시드 정렬(하루 고정). */
  async discoveryToday(userId: string, limit: number): Promise<{ id: string; imageUrl: string | null }[]> {
    return this.db
      .select({ id: places.id, imageUrl: places.imageUrl })
      .from(places)
      .where(
        and(
          eq(places.status, 'ACTIVE'),
          sql`NOT EXISTS (SELECT 1 FROM ${visits} v WHERE v.place_id = ${places.id} AND v.user_id = ${userId})`,
        ),
      )
      .orderBy(sql`md5(${places.id}::text || current_date::text)`)
      .limit(limit);
  }

  async placeNames(
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
}
