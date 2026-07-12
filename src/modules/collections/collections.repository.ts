import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  collections,
  collectionTrans,
  collectionPlace,
  places,
  placeTrans,
  visits,
  type localeEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class CollectionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getActiveCollection(id: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.status, 'ACTIVE')));
    return row ?? null;
  }

  async collectionTrans(
    ids: string[],
    locales: Locale[],
  ): Promise<{ collectionId: string; locale: string; title: string; description: string | null }[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        collectionId: collectionTrans.collectionId,
        locale: collectionTrans.locale,
        title: collectionTrans.title,
        description: collectionTrans.description,
      })
      .from(collectionTrans)
      .where(and(inArray(collectionTrans.collectionId, ids), inArray(collectionTrans.locale, locales)));
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

  /** 소속 장소 keyset(seq ASC, place_id ASC). visited = 이 유저 방문 여부. limit+1 조회. */
  async detailPlacesPage(
    collectionId: string,
    userId: string | null,
    cursor: { seq: number; id: string } | null,
    limit: number,
  ): Promise<{ placeId: string; seq: number; imageUrl: string | null; visited: boolean }[]> {
    const conds: SQL[] = [eq(collectionPlace.collectionId, collectionId)];
    if (cursor) {
      conds.push(
        or(
          gt(collectionPlace.seq, cursor.seq),
          and(eq(collectionPlace.seq, cursor.seq), gt(collectionPlace.placeId, cursor.id)),
        )!,
      );
    }
    const visited = userId ? sql<boolean>`${visits.id} is not null` : sql<boolean>`false`;
    const q = this.db
      .select({
        placeId: collectionPlace.placeId,
        seq: collectionPlace.seq,
        imageUrl: places.imageUrl,
        visited,
      })
      .from(collectionPlace)
      .innerJoin(places, eq(places.id, collectionPlace.placeId));
    const joined = userId
      ? q.leftJoin(visits, and(eq(visits.placeId, collectionPlace.placeId), eq(visits.userId, userId)))
      : q;
    return joined
      .where(and(...conds))
      .orderBy(asc(collectionPlace.seq), asc(collectionPlace.placeId))
      .limit(limit + 1);
  }

  /** all = 소속 수, visited = 그중 이 유저 방문 수(게스트 0). */
  async collectionCounts(
    collectionId: string,
    userId: string | null,
  ): Promise<{ all: number; visited: number }> {
    const [{ value: all }] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(collectionPlace)
      .where(eq(collectionPlace.collectionId, collectionId));
    let visited = 0;
    if (userId) {
      const [{ value }] = await this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(collectionPlace)
        .innerJoin(visits, and(eq(visits.placeId, collectionPlace.placeId), eq(visits.userId, userId)))
        .where(eq(collectionPlace.collectionId, collectionId));
      visited = Number(value);
    }
    return { all: Number(all), visited };
  }
}
