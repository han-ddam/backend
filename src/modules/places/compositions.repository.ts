import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  places,
  placeCompositions,
  placeCompositionTrans,
  type localeEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class CompositionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
}
