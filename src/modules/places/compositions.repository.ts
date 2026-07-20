import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { IdService } from '@platform/id/id.service';
import { ClockService } from '@platform/clock/clock.service';
import {
  places,
  placeTrans,
  regionTrans,
  placeCompositions,
  placeCompositionTrans,
  type localeEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class CompositionsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly id: IdService,
    private readonly clock: ClockService,
  ) {}

  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  async listForPlace(
    placeId: string,
  ): Promise<{ id: string; seq: number; source: string; exampleImageKey: string | null }[]> {
    return this.db
      .select({
        id: placeCompositions.id,
        seq: placeCompositions.seq,
        source: placeCompositions.source,
        exampleImageKey: placeCompositions.exampleImageKey,
      })
      .from(placeCompositions)
      .where(eq(placeCompositions.placeId, placeId))
      .orderBy(
        asc(placeCompositions.seq),
        asc(placeCompositions.createdAt),
        asc(placeCompositions.id),
      );
  }

  async transForCompositions(
    ids: string[],
    locales: Locale[],
  ): Promise<{ compositionId: string; locale: string; title: string; description: string | null }[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        compositionId: placeCompositionTrans.compositionId,
        locale: placeCompositionTrans.locale,
        title: placeCompositionTrans.title,
        description: placeCompositionTrans.description,
      })
      .from(placeCompositionTrans)
      .where(
        and(
          inArray(placeCompositionTrans.compositionId, ids),
          inArray(placeCompositionTrans.locale, locales),
        ),
      );
  }

  async create(
    input: {
      id: string;
      placeId: string;
      seq: number;
      source: 'CURATED' | 'AI';
      exampleImageKey: string | null;
    },
    translations: { locale: string; title: string; description: string | null }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(placeCompositions).values({
        id: input.id,
        placeId: input.placeId,
        seq: input.seq,
        source: input.source,
        exampleImageKey: input.exampleImageKey,
      });
      await tx.insert(placeCompositionTrans).values(
        translations.map((t) => ({
          compositionId: input.id,
          locale: t.locale as Locale,
          title: t.title,
          description: t.description,
        })),
      );
    });
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(placeCompositions)
      .where(eq(placeCompositions.id, id))
      .returning({ id: placeCompositions.id });
    return rows.length > 0;
  }

  /** place.compositions_generated_at (없으면 'MISSING'=place 없음). */
  async generatedAt(placeId: string): Promise<Date | null | 'MISSING'> {
    const [row] = await this.db
      .select({ g: places.compositionsGeneratedAt })
      .from(places)
      .where(eq(places.id, placeId));
    if (!row) return 'MISSING';
    return row.g ?? null;
  }

  async hasCompositions(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: placeCompositions.id })
      .from(placeCompositions)
      .where(eq(placeCompositions.placeId, placeId))
      .limit(1);
    return !!row;
  }

  /** 생성 프롬프트용 place 정보(KO name, 지역명, description). name/description은 place_trans, 지역명은 region_trans(둘 다 KO). */
  async placeGenInfo(
    placeId: string,
  ): Promise<{ name: string; regionName: string; description: string | null } | null> {
    const [p] = await this.db
      .select({ regionCode: places.regionCode })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    if (!p) return null;
    const [t] = await this.db
      .select({ name: placeTrans.name, description: placeTrans.description })
      .from(placeTrans)
      .where(and(eq(placeTrans.placeId, placeId), eq(placeTrans.locale, 'KO')));
    const [r] = await this.db
      .select({ name: regionTrans.name })
      .from(regionTrans)
      .where(and(eq(regionTrans.regionCode, p.regionCode), eq(regionTrans.locale, 'KO')));
    return { name: t?.name ?? '', regionName: r?.name ?? '', description: t?.description ?? null };
  }

  async markGenerated(placeId: string): Promise<void> {
    await this.db
      .update(places)
      .set({ compositionsGeneratedAt: this.clock.now() })
      .where(eq(places.id, placeId));
  }

  /** 생성 결과 저장 + generated_at 세팅(트랜잭션). */
  async insertGenerated(placeId: string, items: { title: string; description: string }[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < items.length; i++) {
        const cid = this.id.generate();
        await tx.insert(placeCompositions).values({ id: cid, placeId, seq: i, source: 'AI', exampleImageKey: null });
        await tx.insert(placeCompositionTrans).values({
          compositionId: cid,
          locale: 'KO',
          title: items[i].title,
          description: items[i].description,
        });
      }
      await tx.update(places).set({ compositionsGeneratedAt: this.clock.now() }).where(eq(places.id, placeId));
    });
  }

  /** region_code + KO name으로 place 해석. 정확히 1건일 때만 반환(0/모호 → null). */
  async resolvePlaceByRegionName(regionCode: string, name: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: places.id })
      .from(places)
      .innerJoin(placeTrans, and(eq(placeTrans.placeId, places.id), eq(placeTrans.locale, 'KO')))
      .where(and(eq(places.regionCode, regionCode), eq(placeTrans.name, name)));
    return rows.length === 1 ? rows[0].id : null;
  }

  /** place 구도 전체 교체(delete→insert) + generated_at 세팅. */
  async replaceForPlace(
    placeId: string,
    items: { seq: number; title: string; description: string | null }[],
    source: 'AI' | 'CURATED',
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(placeCompositions).where(eq(placeCompositions.placeId, placeId)); // trans는 FK CASCADE
      for (const it of items) {
        const cid = this.id.generate();
        await tx.insert(placeCompositions).values({ id: cid, placeId, seq: it.seq, source, exampleImageKey: null });
        await tx.insert(placeCompositionTrans).values({ compositionId: cid, locale: 'KO', title: it.title, description: it.description });
      }
      await tx.update(places).set({ compositionsGeneratedAt: this.clock.now() }).where(eq(places.id, placeId));
    });
  }
}
