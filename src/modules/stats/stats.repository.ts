import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { users, visits, places } from '@db/schema';

export type Period = 'CUMULATIVE' | 'MONTHLY';
export interface RankRow {
  rank: number;
  userId: string;
  score: string;
  handle: string;
}

@Injectable()
export class StatsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** period별 랭킹 CTE 조각 (점수>0만, RANK 공유). */
  private rankedCte(period: Period) {
    const monthly =
      period === 'MONTHLY'
        ? sql`WHERE created_at >= date_trunc('month', now())`
        : sql``;
    return sql`
      SELECT user_id,
             SUM(weighted_score) AS score,
             RANK() OVER (ORDER BY SUM(weighted_score) DESC) AS rank
      FROM score_event
      ${monthly}
      GROUP BY user_id
      HAVING SUM(weighted_score) > 0
    `;
  }

  /** (score DESC, user_id ASC) keyset 페이지. score는 exact numeric 문자열로 반환(커서용). */
  async rankPage(
    period: Period,
    limit: number,
    cursor: { score: string; userId: string } | null,
  ): Promise<RankRow[]> {
    const keyset = cursor
      ? sql`WHERE (r.score < ${cursor.score}::numeric)
             OR (r.score = ${cursor.score}::numeric AND r.user_id > ${cursor.userId})`
      : sql``;
    const rows = await this.db.execute<{
      rank: number;
      user_id: string;
      score: string;
      handle: string;
    }>(sql`
      WITH ranked AS (${this.rankedCte(period)})
      SELECT r.rank::int AS rank, r.user_id, r.score::text AS score, u.handle
      FROM ranked r JOIN ${users} u ON u.id = r.user_id
      ${keyset}
      ORDER BY r.score DESC, r.user_id ASC
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      rank: Number(r.rank),
      userId: r.user_id,
      score: r.score,
      handle: r.handle,
    }));
  }

  /** 내 순위/점수/총 랭커수/다음순위까지 점수차. 미랭크면 rank null, 나머지 0. */
  async myStats(
    userId: string,
    period: Period,
  ): Promise<{ rank: number | null; score: number; totalRankers: number; pointsToNext: number }> {
    const rows = await this.db.execute<{
      rank: number | null;
      score: number;
      total: number;
      points_to_next: number;
    }>(sql`
      WITH ranked AS (${this.rankedCte(period)})
      SELECT
        (SELECT rank::int FROM ranked WHERE user_id = ${userId}) AS rank,
        COALESCE((SELECT score::float8 FROM ranked WHERE user_id = ${userId}), 0) AS score,
        (SELECT count(*)::int FROM ranked) AS total,
        COALESCE(
          (SELECT MIN(score) FROM ranked WHERE score > (SELECT score FROM ranked WHERE user_id = ${userId}))
          - (SELECT score FROM ranked WHERE user_id = ${userId}),
          0
        )::float8 AS points_to_next
    `);
    const r = rows.at(0);
    return {
      rank: r?.rank == null ? null : Number(r.rank),
      score: Number(r?.score ?? 0),
      totalRankers: Number(r?.total ?? 0),
      pointsToNext: Number(r?.points_to_next ?? 0),
    };
  }

  /** userIds별 도감 % (방문 distinct / 전국 ACTIVE place). */
  async dogamPercentFor(userIds: string[]): Promise<Map<string, number>> {
    const m = new Map<string, number>();
    if (userIds.length === 0) return m;
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(places)
      .where(eq(places.status, 'ACTIVE'));
    const totalN = Number(total);
    const rows = await this.db
      .select({ userId: visits.userId, visited: sql<number>`count(distinct ${visits.placeId})::int` })
      .from(visits)
      .innerJoin(places, eq(places.id, visits.placeId))
      .where(and(inArray(visits.userId, userIds), eq(places.status, 'ACTIVE')))
      .groupBy(visits.userId);
    for (const row of rows) {
      const pct = totalN > 0 ? Math.round((Number(row.visited) / totalN) * 100) : 0;
      m.set(row.userId, pct);
    }
    return m;
  }

  async userBasic(userId: string): Promise<{ handle: string; displayName: string } | null> {
    const [row] = await this.db
      .select({ handle: users.handle, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? null;
  }
}
