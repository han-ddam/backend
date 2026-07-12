import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, like, lt, or, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { decodeCursor } from '@platform/pagination/cursor';
import {
  places,
  placeTrans,
  visits,
  userPlaceBookmarks,
  type Place,
  type PlaceTrans,
  type localeEnum,
  type placeStatusEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];
type PlaceStatus = (typeof placeStatusEnum.enumValues)[number];

export interface CreatePlaceInput {
  id: string;
  regionCode: string;
  tourapiContentId?: string | null;
  lat?: number | null;
  lng?: number | null;
  basePoints: number;
  rarityWeight: string; // numeric as string
  tags: string[];
  status?: PlaceStatus; // 생략 시 DB 기본값(ACTIVE) — 어드민 생성 경로용
  createdBy?: string | null; // 사용자 제출 장소의 등록자 (어드민/시드는 생략 → NULL)
}

export interface PlaceTransInput {
  locale: Locale;
  name: string;
  address?: string | null;
  description?: string | null;
  mission?: string | null;
}

@Injectable()
export class PlacesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<Place | undefined> {
    const [row] = await this.db.select().from(places).where(eq(places.id, id));
    return row;
  }

  /** 해당 유저의 방문·찜 여부(1쿼리). visitStatus 3-state 산출용. */
  async userPlaceFlags(
    userId: string,
    placeId: string,
  ): Promise<{ visited: boolean; bookmarked: boolean }> {
    const rows = await this.db.execute<{ visited: boolean; bookmarked: boolean }>(sql`
      SELECT
        EXISTS(SELECT 1 FROM ${visits} v WHERE v.user_id = ${userId} AND v.place_id = ${placeId}) AS visited,
        EXISTS(SELECT 1 FROM ${userPlaceBookmarks} b WHERE b.user_id = ${userId} AND b.place_id = ${placeId}) AS bookmarked
    `);
    const row = rows[0];
    return { visited: !!row?.visited, bookmarked: !!row?.bookmarked };
  }

  /** Translations for a place in the given locales (caller picks/fallbacks). */
  async transFor(placeId: string, locales: Locale[]): Promise<PlaceTrans[]> {
    return this.db
      .select()
      .from(placeTrans)
      .where(
        and(eq(placeTrans.placeId, placeId), inArray(placeTrans.locale, locales)),
      );
  }

  /** Translations for many places (list rendering). */
  async transForMany(
    placeIds: string[],
    locales: Locale[],
  ): Promise<PlaceTrans[]> {
    if (placeIds.length === 0) return [];
    return this.db
      .select()
      .from(placeTrans)
      .where(
        and(
          inArray(placeTrans.placeId, placeIds),
          inArray(placeTrans.locale, locales),
        ),
      );
  }

  /** Keyset list of places within a province (region_code prefix), newest first. */
  async listByProvince(params: {
    province: string;
    status: PlaceStatus;
    limit: number;
    cursor?: string;
  }): Promise<Place[]> {
    const c = decodeCursor(params.cursor);
    const conds = [
      like(places.regionCode, `${params.province}\\_%`),
      eq(places.status, params.status),
    ];
    if (c) {
      conds.push(
        or(
          lt(places.createdAt, c.createdAt),
          and(eq(places.createdAt, c.createdAt), lt(places.id, c.id)),
        )!,
      );
    }
    return this.db
      .select()
      .from(places)
      .where(and(...conds))
      .orderBy(desc(places.createdAt), desc(places.id))
      .limit(params.limit + 1);
  }

  /** Admin offset list (with total). */
  async listAll(params: {
    limit: number;
    offset: number;
    province?: string;
    status?: PlaceStatus;
  }): Promise<{ rows: Place[]; total: number }> {
    const conds = [];
    if (params.province) {
      conds.push(like(places.regionCode, `${params.province}\\_%`));
    }
    if (params.status) conds.push(eq(places.status, params.status));
    const where = conds.length > 0 ? and(...conds) : undefined;
    const rows = await this.db
      .select()
      .from(places)
      .where(where)
      .orderBy(desc(places.createdAt))
      .limit(params.limit)
      .offset(params.offset);
    const [{ value }] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(places)
      .where(where);
    return { rows, total: Number(value) };
  }

  async setStatus(
    id: string,
    status: 'ACTIVE' | 'HIDDEN',
  ): Promise<{ id: string; status: string } | undefined> {
    const [row] = await this.db
      .update(places)
      .set({ status, updatedAt: sql`now()` })
      .where(eq(places.id, id))
      .returning({ id: places.id, status: places.status });
    return row;
  }

  async create(
    input: CreatePlaceInput,
    trans: PlaceTransInput[],
  ): Promise<Place> {
    return this.db.transaction(async (tx) => {
      const [place] = await tx
        .insert(places)
        .values({
          id: input.id,
          regionCode: input.regionCode,
          tourapiContentId: input.tourapiContentId ?? null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          basePoints: input.basePoints,
          rarityWeight: input.rarityWeight,
          tags: input.tags,
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.createdBy !== undefined ? { createdBy: input.createdBy } : {}),
        })
        .returning();
      await tx.insert(placeTrans).values(
        trans.map((t) => ({
          placeId: place.id,
          locale: t.locale,
          name: t.name,
          address: t.address ?? null,
          description: t.description ?? null,
          mission: t.mission ?? null,
        })),
      );
      return place;
    });
  }

  /** 좌표 기준 radiusM 내 최근접 ACTIVE 장소의 시·군·구 코드 (없으면 null). */
  async nearestRegionCode(
    lat: number,
    lng: number,
    radiusM: number,
  ): Promise<string | null> {
    const target = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const placePoint = sql`ST_SetSRID(ST_MakePoint(${places.lng}, ${places.lat}), 4326)::geography`;
    const [row] = await this.db
      .select({ regionCode: places.regionCode })
      .from(places)
      .where(
        and(
          eq(places.status, 'ACTIVE'),
          isNotNull(places.lat),
          isNotNull(places.lng),
          sql`ST_DWithin(${placePoint}, ${target}, ${radiusM})`,
        ),
      )
      .orderBy(sql`ST_Distance(${placePoint}, ${target})`)
      .limit(1);
    return row?.regionCode ?? null;
  }

  /** 좌표 기준 radiusM 내 ACTIVE 장소 목록(거리 ASC). GPS 원본은 저장하지 않음. */
  async nearbyPlaces(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
  ): Promise<{ id: string; regionCode: string; distanceM: number }[]> {
    const target = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const placePoint = sql`ST_SetSRID(ST_MakePoint(${places.lng}, ${places.lat}), 4326)::geography`;
    const rows = await this.db
      .select({
        id: places.id,
        regionCode: places.regionCode,
        distanceM: sql<number>`ST_Distance(${placePoint}, ${target})`,
      })
      .from(places)
      .where(
        and(
          eq(places.status, 'ACTIVE'),
          isNotNull(places.lat),
          isNotNull(places.lng),
          sql`ST_DWithin(${placePoint}, ${target}, ${radiusM})`,
        ),
      )
      .orderBy(sql`ST_Distance(${placePoint}, ${target})`)
      .limit(limit);
    return rows.map((r) => ({ id: r.id, regionCode: r.regionCode, distanceM: Number(r.distanceM) }));
  }
}
