import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { decodeCursor } from '@platform/pagination/cursor';
import { placeRatings, places, users } from '@db/schema';

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

  async aggregate(placeId: string): Promise<{ avg: string | null; count: number; reviewCount: number }> {
    const [row] = await this.db
      .select({
        avg: sql<string | null>`avg(${placeRatings.score})`,
        count: sql<number>`count(*)::int`,
        reviewCount: sql<number>`(count(*) filter (where ${placeRatings.comment} is not null))::int`,
      })
      .from(placeRatings)
      .where(eq(placeRatings.placeId, placeId));
    return { avg: row?.avg ?? null, count: Number(row?.count ?? 0), reviewCount: Number(row?.reviewCount ?? 0) };
  }

  async myScore(userId: string, placeId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ score: placeRatings.score })
      .from(placeRatings)
      .where(and(eq(placeRatings.userId, userId), eq(placeRatings.placeId, placeId)));
    return row ? Number(row.score) : null;
  }

  /** 내 place_rating 행의 comment 갱신. 갱신된 행 있으면 true(별점 선행 판정·삭제 공용). */
  async setComment(userId: string, placeId: string, comment: string | null): Promise<boolean> {
    const rows = await this.db
      .update(placeRatings)
      .set({ comment, updatedAt: sql`now()` })
      .where(and(eq(placeRatings.userId, userId), eq(placeRatings.placeId, placeId)))
      .returning({ userId: placeRatings.userId });
    return rows.length > 0;
  }

  /** place의 리뷰(comment 非null) — updated_at DESC, user_id DESC 키셋. limit+1. */
  async reviewsForPlace(
    placeId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ userId: string; score: string; comment: string; updatedAt: Date; handle: string }[]> {
    const c = decodeCursor(cursor);
    const conds = [eq(placeRatings.placeId, placeId), isNotNull(placeRatings.comment)];
    if (c) {
      conds.push(
        or(
          lt(placeRatings.updatedAt, c.createdAt),
          and(eq(placeRatings.updatedAt, c.createdAt), lt(placeRatings.userId, c.id)),
        )!,
      );
    }
    return this.db
      .select({
        userId: placeRatings.userId,
        score: placeRatings.score,
        comment: sql<string>`${placeRatings.comment}`,
        updatedAt: placeRatings.updatedAt,
        handle: users.handle,
      })
      .from(placeRatings)
      .innerJoin(users, eq(users.id, placeRatings.userId))
      .where(and(...conds))
      .orderBy(desc(placeRatings.updatedAt), desc(placeRatings.userId))
      .limit(limit + 1);
  }
}
