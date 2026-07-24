import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or, lt, desc, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { decodeCursor } from '@platform/pagination/cursor';
import { userPlaceBookmarks, places, placeTrans, visits, localeEnum } from '@db/schema';

export type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class BookmarksRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  /** 찜 추가 — 이미 있으면 무시(멱등). */
  async add(userId: string, placeId: string): Promise<void> {
    await this.db
      .insert(userPlaceBookmarks)
      .values({ userId, placeId })
      .onConflictDoNothing({ target: [userPlaceBookmarks.userId, userPlaceBookmarks.placeId] });
  }

  /** 찜 해제 — 없어도 무시(멱등). */
  async remove(userId: string, placeId: string): Promise<void> {
    await this.db
      .delete(userPlaceBookmarks)
      .where(and(eq(userPlaceBookmarks.userId, userId), eq(userPlaceBookmarks.placeId, placeId)));
  }

  /** 유저의 찜 목록(ACTIVE만) — keyset(createdAt DESC, placeId DESC), limit+1개. */
  async listByUser(params: {
    userId: string;
    cursor?: string;
    limit: number;
  }): Promise<
    { id: string; regionCode: string; imageUrl: string | null; createdAt: Date; visited: boolean }[]
  > {
    const c = decodeCursor(params.cursor);
    const conds = [
      eq(userPlaceBookmarks.userId, params.userId),
      eq(places.status, 'ACTIVE'),
    ];
    if (c) {
      conds.push(
        or(
          lt(userPlaceBookmarks.createdAt, c.createdAt),
          and(eq(userPlaceBookmarks.createdAt, c.createdAt), lt(userPlaceBookmarks.placeId, c.id)),
        )!,
      );
    }
    return this.db
      .select({
        id: userPlaceBookmarks.placeId,
        regionCode: places.regionCode,
        imageUrl: places.imageUrl,
        createdAt: userPlaceBookmarks.createdAt,
        visited: sql<boolean>`EXISTS(SELECT 1 FROM ${visits} v WHERE v.user_id = ${userPlaceBookmarks.userId} AND v.place_id = ${userPlaceBookmarks.placeId})`,
      })
      .from(userPlaceBookmarks)
      .innerJoin(places, eq(places.id, userPlaceBookmarks.placeId))
      .where(and(...conds))
      .orderBy(desc(userPlaceBookmarks.createdAt), desc(userPlaceBookmarks.placeId))
      .limit(params.limit + 1);
  }

  /** 여러 place의 번역(목록 이름용). caller가 locale 폴백 선택. */
  async transForMany(
    placeIds: string[],
    locales: Locale[],
  ): Promise<{ placeId: string; locale: Locale; name: string }[]> {
    if (placeIds.length === 0) return [];
    return this.db
      .select({ placeId: placeTrans.placeId, locale: placeTrans.locale, name: placeTrans.name })
      .from(placeTrans)
      .where(and(inArray(placeTrans.placeId, placeIds), inArray(placeTrans.locale, locales)));
  }
}
