import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { places, visits, regions } from '@db/schema';

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
}
