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

  /** ACTIVE 테마 keyset(seq ASC, id ASC). limit+1 조회. */
  async themesPage(
    cursor: { seq: number; id: string } | null,
    limit: number,
  ): Promise<{ id: string; seq: number }[]> {
    const conds: SQL[] = [eq(collections.status, 'ACTIVE')];
    if (cursor) {
      conds.push(
        or(
          gt(collections.seq, cursor.seq),
          and(eq(collections.seq, cursor.seq), gt(collections.id, cursor.id)),
        )!,
      );
    }
    return this.db
      .select({ id: collections.id, seq: collections.seq })
      .from(collections)
      .where(and(...conds))
      .orderBy(asc(collections.seq), asc(collections.id))
      .limit(limit + 1);
  }

  /** 테마별 {filled(방문 수), total(소속 수)}. */
  async themeProgress(
    userId: string,
    ids: string[],
  ): Promise<Map<string, { filled: number; total: number }>> {
    const map = new Map<string, { filled: number; total: number }>();
    if (ids.length === 0) return map;
    const totals = await this.db
      .select({ cid: collectionPlace.collectionId, total: sql<number>`count(*)::int` })
      .from(collectionPlace)
      .where(inArray(collectionPlace.collectionId, ids))
      .groupBy(collectionPlace.collectionId);
    const filled = await this.db
      .select({ cid: collectionPlace.collectionId, filled: sql<number>`count(*)::int` })
      .from(collectionPlace)
      .innerJoin(visits, and(eq(visits.placeId, collectionPlace.placeId), eq(visits.userId, userId)))
      .where(inArray(collectionPlace.collectionId, ids))
      .groupBy(collectionPlace.collectionId);
    for (const id of ids) map.set(id, { filled: 0, total: 0 });
    for (const r of totals) map.set(r.cid, { filled: 0, total: Number(r.total) });
    for (const r of filled) {
      const cur = map.get(r.cid) ?? { filled: 0, total: 0 };
      map.set(r.cid, { filled: Number(r.filled), total: cur.total });
    }
    return map;
  }

  /** 테마별 소속 place image_url 앞 4개(seq ASC, place_id ASC, null 제외). */
  async themeThumbnails(ids: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;
    for (const id of ids) map.set(id, []);
    const rows = await this.db
      .select({ cid: collectionPlace.collectionId, imageUrl: places.imageUrl, seq: collectionPlace.seq, pid: collectionPlace.placeId })
      .from(collectionPlace)
      .innerJoin(places, eq(places.id, collectionPlace.placeId))
      .where(and(inArray(collectionPlace.collectionId, ids), sql`${places.imageUrl} is not null`))
      .orderBy(asc(collectionPlace.seq), asc(collectionPlace.placeId));
    for (const r of rows) {
      const arr = map.get(r.cid)!;
      if (arr.length < 4 && r.imageUrl) arr.push(r.imageUrl);
    }
    return map;
  }

  /** province 코드별(region_code 접두) 소속 place image_url 앞 4개. */
  async regionThumbnails(codes: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (codes.length === 0) return map;
    for (const c of codes) map.set(c, []);
    const rows = await this.db.execute<{ prov: string; image_url: string }>(sql`
      SELECT prov, image_url FROM (
        SELECT split_part(region_code, '_', 1) AS prov, image_url,
               row_number() OVER (PARTITION BY split_part(region_code, '_', 1) ORDER BY id ASC) AS rn
        FROM ${places}
        WHERE status = 'ACTIVE' AND image_url IS NOT NULL
          AND split_part(region_code, '_', 1) = ANY(${codes})
      ) t WHERE rn <= 4
      ORDER BY prov, rn
    `);
    for (const r of rows) {
      const arr = map.get(r.prov);
      if (arr) arr.push(r.image_url);
    }
    return map;
  }

  /** ACTIVE 테마가 하나라도 있는지. */
  async anyActiveTheme(): Promise<boolean> {
    const [row] = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.status, 'ACTIVE'))
      .limit(1);
    return !!row;
  }
}
