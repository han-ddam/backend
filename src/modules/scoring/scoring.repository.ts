import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { places, regions, scoreRules, regionWeights, scoreWeightConfigs } from '@db/schema';

export interface PlaceScoreRow {
  basePoints: number;
  rarityWeight: string; // numeric → string
  provinceCode: string;
  visitWeight: string;
  photoWeight: string;
}

@Injectable()
export class ScoringRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** ACTIVE place의 점수 재료 + 소속 시·도 코드(coalesce(parent_code, code)). */
  async placeForScoring(placeId: string): Promise<PlaceScoreRow | null> {
    const [row] = await this.db
      .select({
        basePoints: places.basePoints,
        rarityWeight: places.rarityWeight,
        provinceCode: sql<string>`coalesce(${regions.parentCode}, ${regions.code})`,
        visitWeight: sql<string>`coalesce(${scoreWeightConfigs.visitWeight}, 1.0)`,
        photoWeight: sql<string>`coalesce(${scoreWeightConfigs.photoWeight}, 1.0)`,
      })
      .from(places)
      .innerJoin(regions, eq(regions.code, places.regionCode))
      .leftJoin(scoreWeightConfigs, eq(scoreWeightConfigs.id, places.weightConfigId))
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return row ?? null;
  }

  async ruleBasePoints(action: string): Promise<number | null> {
    const [row] = await this.db
      .select({ basePoints: scoreRules.basePoints })
      .from(scoreRules)
      .where(eq(scoreRules.action, action));
    return row?.basePoints ?? null;
  }

  async regionWeight(provinceCode: string): Promise<string | null> {
    const [row] = await this.db
      .select({ weight: regionWeights.weight })
      .from(regionWeights)
      .where(eq(regionWeights.regionCode, provinceCode));
    return row?.weight ?? null;
  }
}
