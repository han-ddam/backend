import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { placeRatings, places } from '@db/schema';

@Injectable()
export class RatingsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  /** (user, place) 별점 upsert — 있으면 score·updated_at 갱신. score는 numeric 문자열. */
  async upsert(userId: string, placeId: string, score: string): Promise<void> {
    await this.db
      .insert(placeRatings)
      .values({ userId, placeId, score })
      .onConflictDoUpdate({
        target: [placeRatings.userId, placeRatings.placeId],
        set: { score, updatedAt: sql`now()` },
      });
  }

  async aggregate(placeId: string): Promise<{ avg: string | null; count: number }> {
    const [row] = await this.db
      .select({
        avg: sql<string | null>`avg(${placeRatings.score})`,
        count: sql<number>`count(*)::int`,
      })
      .from(placeRatings)
      .where(eq(placeRatings.placeId, placeId));
    return { avg: row?.avg ?? null, count: Number(row?.count ?? 0) };
  }

  async myScore(userId: string, placeId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ score: placeRatings.score })
      .from(placeRatings)
      .where(and(eq(placeRatings.userId, userId), eq(placeRatings.placeId, placeId)));
    return row ? Number(row.score) : null;
  }
}
