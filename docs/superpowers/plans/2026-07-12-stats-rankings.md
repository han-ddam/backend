# 점수/EXP/랭킹 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `score_event` 원장 집계로 누적점수·EXP·레벨·전국 랭킹을 계산해 `GET /me/profile` + `GET /rankings` 제공.

**Architecture:** 신규 `stats` 모듈. 레벨은 순수 함수(`level.ts`), 점수/랭킹은 실시간 SQL(window RANK + keyset). dogamPercent/visitedCount는 `DogamService.overview` 재사용. 신규 테이블 없음.

**Tech Stack:** NestJS 11, Drizzle(PostgreSQL, raw `db.execute` for window functions), nestjs-zod, Jest. 스펙: `docs/superpowers/specs/2026-07-12-stats-rankings-design.md`

## Global Constraints

- **브랜치**: `feat/stats-rankings` (main 최신에서 생성). Co-Authored-By 트레일러 금지.
- **툴체인**: `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...`. `lint` 실행 금지.
- **응답 envelope**: 성공 `{result:...}`만 — 컨트롤러는 payload만 반환.
- **정책(정확값)**:
  - EXP = `sum(score_event.weighted_score)` 누적. 레벨 임계치 `threshold(L)=50*(L-1)*L`(1:0,2:100,3:300,4:600...).
  - **점수 0 제외**: `HAVING sum(weighted_score) > 0` — 랭킹·totalUsers에서 제외.
  - RANK = `RANK() OVER (ORDER BY sum(weighted_score) DESC)`(동점 공유), 페이지 정렬·keyset = `(score DESC, user_id ASC)`.
  - MONTHLY = `created_at >= date_trunc('month', now())`.
  - leaderboard limit 기본 20·max 100. 커서 keyset은 **점수 exact(numeric 문자열)** + user_id.
  - pointsToNext = 바로 위 순위 점수 − 내 점수(1위/미랭크 → 0). topPercent = `round(rank/totalUsers*100)`(미랭크 null). badge = null.
  - avatarUrl = null(컬럼 없음). 로그인 필수(JwtAuthGuard, `@CurrentUser`).
- **경로 별칭**: `@db/schema`, `@platform/...`, `@modules/...`.
- **재사용**: `DogamService.overview(userId): Promise<{percent,collected,total}>`(DogamModule export). raw SQL은 `this.db.execute<T>(sql\`...\`)` (geo.service 패턴).
- 현재 테스트 기준선 115. 착수 전 `corepack pnpm test`로 재확인.

---

### Task 1: 레벨 공식 (순수 함수, TDD)

**Files:**
- Create: `src/modules/stats/level.ts`
- Test: `src/modules/stats/level.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface LevelInfo { level: number; exp: number; expForNextLevel: number; }
export function levelFromExp(totalExp: number): LevelInfo;
```
Task 2 서비스가 `levelFromExp`를 profile에서 사용.

- [ ] **Step 1: 브랜치 + 실패 테스트**
```bash
git checkout main && git checkout -b feat/stats-rankings
```
`src/modules/stats/level.spec.ts`:
```ts
import { levelFromExp } from './level';

describe('levelFromExp', () => {
  it('exp 0 → level 1, 0/100', () => {
    expect(levelFromExp(0)).toEqual({ level: 1, exp: 0, expForNextLevel: 100 });
  });
  it('just below level 2 threshold stays level 1', () => {
    expect(levelFromExp(99)).toEqual({ level: 1, exp: 99, expForNextLevel: 100 });
  });
  it('exactly threshold(2)=100 → level 2, 0/200', () => {
    expect(levelFromExp(100)).toEqual({ level: 2, exp: 0, expForNextLevel: 200 });
  });
  it('mid level 2', () => {
    expect(levelFromExp(299)).toEqual({ level: 2, exp: 199, expForNextLevel: 200 });
  });
  it('threshold(3)=300 → level 3, 0/300', () => {
    expect(levelFromExp(300)).toEqual({ level: 3, exp: 0, expForNextLevel: 300 });
  });
  it('2450 → level 7 (threshold7=2100), 350/700', () => {
    expect(levelFromExp(2450)).toEqual({ level: 7, exp: 350, expForNextLevel: 700 });
  });
  it('negative/NaN-safe → level 1', () => {
    expect(levelFromExp(-5)).toEqual({ level: 1, exp: 0, expForNextLevel: 100 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- level`
Expected: FAIL — `Cannot find module './level'`

- [ ] **Step 3: 구현**

`src/modules/stats/level.ts`:
```ts
/** 누적 EXP → 레벨/레벨 내 진행/레벨 구간. threshold(L)=50*(L-1)*L. */
export interface LevelInfo {
  level: number;
  exp: number;
  expForNextLevel: number;
}

const threshold = (level: number): number => 50 * (level - 1) * level;

export function levelFromExp(totalExp: number): LevelInfo {
  const exp = Number.isFinite(totalExp) && totalExp > 0 ? totalExp : 0;
  let level = 1;
  while (threshold(level + 1) <= exp) level++;
  return {
    level,
    exp: exp - threshold(level),
    expForNextLevel: threshold(level + 1) - threshold(level),
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `corepack pnpm test -- level`
Expected: PASS 7/7

- [ ] **Step 5: 커밋**
```bash
git add src/modules/stats/level.ts src/modules/stats/level.spec.ts
git commit -m "feat(stats): level formula (cumulative exp thresholds)"
```

---

### Task 2: Repository(집계 SQL) + Service(profile+rankings) + Module (TDD)

**Files:**
- Create: `src/modules/stats/stats.repository.ts`
- Create: `src/modules/stats/stats.service.ts`
- Create: `src/modules/stats/stats.module.ts`
- Test: `src/modules/stats/stats.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `levelFromExp`, `DogamService.overview`.
- Produces:
```ts
// repository
type Period = 'CUMULATIVE' | 'MONTHLY';
interface RankRow { rank: number; userId: string; score: string; handle: string } // score = exact numeric string
rankPage(period: Period, limit: number, cursor: { score: string; userId: string } | null): Promise<RankRow[]>  // limit개, (score DESC, user_id ASC)
myStats(userId: string, period: Period): Promise<{ rank: number | null; score: number; totalRankers: number; pointsToNext: number }>
dogamPercentFor(userIds: string[]): Promise<Map<string, number>>  // userId → dogam %
userBasic(userId: string): Promise<{ handle: string; displayName: string } | null>
// service
StatsService.profile(userId): Promise<ProfileResult>
StatsService.rankings(userId, scope, period, cursor?, limit?): Promise<RankingsResult>
```
Task 3 컨트롤러가 profile/rankings 호출.

- [ ] **Step 1: 실패하는 서비스 테스트 작성**

`src/modules/stats/stats.service.spec.ts`:
```ts
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let repo: any, dogam: any, service: StatsService;

  beforeEach(() => {
    repo = {
      rankPage: jest.fn(),
      myStats: jest.fn(),
      dogamPercentFor: jest.fn(),
      userBasic: jest.fn(),
    };
    dogam = { overview: jest.fn() };
    service = new StatsService(repo, dogam);
  });

  describe('profile', () => {
    it('assembles level + dogam + rank', async () => {
      repo.userBasic.mockResolvedValue({ handle: '@a', displayName: '에이' });
      repo.myStats.mockResolvedValue({ rank: 127, score: 2450, totalRankers: 15284, pointsToNext: 18 });
      dogam.overview.mockResolvedValue({ percent: 63, collected: 102, total: 370 });
      const out = await service.profile('u1');
      expect(repo.myStats).toHaveBeenCalledWith('u1', 'CUMULATIVE');
      expect(out).toEqual({
        handle: '@a', displayName: '에이', avatarUrl: null,
        level: 7, exp: 350, expForNextLevel: 700,
        dogamPercent: 63, visitedCount: 102,
        nationalRank: 127, totalUsers: 15284,
      });
    });

    it('rank null when user has no score', async () => {
      repo.userBasic.mockResolvedValue({ handle: '@b', displayName: '비' });
      repo.myStats.mockResolvedValue({ rank: null, score: 0, totalRankers: 15284, pointsToNext: 0 });
      dogam.overview.mockResolvedValue({ percent: 0, collected: 0, total: 370 });
      const out = await service.profile('u2');
      expect(out.level).toBe(1);
      expect(out.exp).toBe(0);
      expect(out.nationalRank).toBeNull();
    });
  });

  describe('rankings', () => {
    it('builds top3, leaderboard (with dogam% + nextCursor), me, topPercent', async () => {
      // rankPage called twice: top3 (limit 3) and page (limit+1=3 for limit 2)
      repo.rankPage.mockImplementation(async (_p: string, limit: number) => {
        const all = [
          { rank: 1, userId: 'x', score: '980', handle: '@x' },
          { rank: 2, userId: 'y', score: '500', handle: '@y' },
          { rank: 3, userId: 'z', score: '320', handle: '@z' },
        ];
        return all.slice(0, limit);
      });
      repo.dogamPercentFor.mockResolvedValue(new Map([['x', 40], ['y', 22]]));
      repo.myStats.mockResolvedValue({ rank: 127, score: 315, totalRankers: 200, pointsToNext: 18 });
      dogam.overview.mockResolvedValue({ percent: 63, collected: 102, total: 370 });

      const out = await service.rankings('u1', 'NATIONAL', 'CUMULATIVE', undefined, 2);
      // top3
      expect(out.top3).toEqual([
        { rank: 1, handle: '@x', score: 980, badge: null },
        { rank: 2, handle: '@y', score: 500, badge: null },
        { rank: 3, handle: '@z', score: 320, badge: null },
      ]);
      // leaderboard: limit 2 → fetched 3 → hasNext true, items 2, nextCursor set
      expect(out.leaderboard.items).toEqual([
        { rank: 1, handle: '@x', score: 980, dogamPercent: 40 },
        { rank: 2, handle: '@y', score: 500, dogamPercent: 22 },
      ]);
      expect(out.leaderboard.nextCursor).toEqual(expect.any(String));
      // me
      expect(out.me).toEqual({ rank: 127, score: 315, dogamPercent: 63, pointsToNext: 18 });
      // topPercent = round(127/200*100) = 64
      expect(out.topPercent).toBe(64);
    });

    it('last page → nextCursor null; unranked me → topPercent null', async () => {
      repo.rankPage.mockImplementation(async (_p: string, limit: number) =>
        [{ rank: 1, userId: 'x', score: '980', handle: '@x' }].slice(0, limit),
      );
      repo.dogamPercentFor.mockResolvedValue(new Map([['x', 40]]));
      repo.myStats.mockResolvedValue({ rank: null, score: 0, totalRankers: 1, pointsToNext: 0 });
      dogam.overview.mockResolvedValue({ percent: 0, collected: 0, total: 370 });
      const out = await service.rankings('u9', 'NATIONAL', 'MONTHLY', undefined, 20);
      expect(out.leaderboard.nextCursor).toBeNull();
      expect(out.me).toEqual({ rank: null, score: 0, dogamPercent: 0, pointsToNext: 0 });
      expect(out.topPercent).toBeNull();
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- stats.service`
Expected: FAIL — `Cannot find module './stats.service'`

- [ ] **Step 3: Repository 작성**

`src/modules/stats/stats.repository.ts`:
```ts
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
```

- [ ] **Step 4: Service 작성**

`src/modules/stats/stats.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { DogamService } from '@modules/dogam/dogam.service';
import { levelFromExp } from './level';
import { StatsRepository, type Period } from './stats.repository';

export interface ProfileResult {
  handle: string;
  displayName: string;
  avatarUrl: null;
  level: number;
  exp: number;
  expForNextLevel: number;
  dogamPercent: number;
  visitedCount: number;
  nationalRank: number | null;
  totalUsers: number;
}

export interface LeaderboardItem {
  rank: number;
  handle: string;
  score: number;
  dogamPercent: number;
}
export interface RankingsResult {
  topPercent: number | null;
  top3: { rank: number; handle: string; score: number; badge: null }[];
  leaderboard: { items: LeaderboardItem[]; nextCursor: string | null };
  me: { rank: number | null; score: number; dogamPercent: number; pointsToNext: number };
}

function encodeRankCursor(score: string, userId: string): string {
  return Buffer.from(`${score}|${userId}`).toString('base64url');
}
function decodeRankCursor(c?: string): { score: string; userId: string } | null {
  if (!c) return null;
  try {
    const [score, userId] = Buffer.from(c, 'base64url').toString('utf8').split('|');
    if (!score || !userId) return null;
    return { score, userId };
  } catch {
    return null;
  }
}

@Injectable()
export class StatsService {
  constructor(
    private readonly repo: StatsRepository,
    private readonly dogam: DogamService,
  ) {}

  async profile(userId: string): Promise<ProfileResult> {
    const basic = await this.repo.userBasic(userId);
    if (!basic) throw new NotFoundException('User not found');
    const me = await this.repo.myStats(userId, 'CUMULATIVE');
    const lvl = levelFromExp(me.score);
    const dg = await this.dogam.overview(userId);
    return {
      handle: basic.handle,
      displayName: basic.displayName,
      avatarUrl: null,
      level: lvl.level,
      exp: lvl.exp,
      expForNextLevel: lvl.expForNextLevel,
      dogamPercent: dg.percent,
      visitedCount: dg.collected,
      nationalRank: me.rank,
      totalUsers: me.totalRankers,
    };
  }

  async rankings(
    userId: string,
    _scope: 'NATIONAL',
    period: Period,
    cursor?: string,
    limit?: number,
  ): Promise<RankingsResult> {
    const lim = Math.min(Math.max(limit ?? 20, 1), 100);

    const top3rows = await this.repo.rankPage(period, 3, null);
    const top3 = top3rows.map((r) => ({
      rank: r.rank,
      handle: r.handle,
      score: Number(r.score),
      badge: null as null,
    }));

    const pageRows = await this.repo.rankPage(period, lim + 1, decodeRankCursor(cursor));
    const hasNext = pageRows.length > lim;
    const pageItems = hasNext ? pageRows.slice(0, lim) : pageRows;
    const last = pageItems.at(-1);
    const nextCursor = hasNext && last ? encodeRankCursor(last.score, last.userId) : null;

    const dogamMap = await this.repo.dogamPercentFor(pageItems.map((r) => r.userId));
    const items: LeaderboardItem[] = pageItems.map((r) => ({
      rank: r.rank,
      handle: r.handle,
      score: Number(r.score),
      dogamPercent: dogamMap.get(r.userId) ?? 0,
    }));

    const me = await this.repo.myStats(userId, period);
    const myDogam = await this.dogam.overview(userId);
    const topPercent =
      me.rank != null && me.totalRankers > 0
        ? Math.round((me.rank / me.totalRankers) * 100)
        : null;

    return {
      topPercent,
      top3,
      leaderboard: { items, nextCursor },
      me: {
        rank: me.rank,
        score: me.score,
        dogamPercent: myDogam.percent,
        pointsToNext: me.pointsToNext,
      },
    };
  }
}
```

- [ ] **Step 5: Module 작성**

`src/modules/stats/stats.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { StatsRepository } from './stats.repository';
import { StatsService } from './stats.service';

@Module({
  imports: [AuthModule, DogamModule], // JwtAuthGuard, DogamService(overview)
  providers: [StatsRepository, StatsService],
  exports: [StatsService],
})
export class StatsModule {}
```

- [ ] **Step 6: GREEN + 전체 + 빌드**

Run: `corepack pnpm test -- stats.service` → PASS (profile 2 + rankings 2)
Run: `corepack pnpm test && corepack pnpm build` → 전체 통과 + 빌드 성공.

- [ ] **Step 7: 커밋**
```bash
git add src/modules/stats/stats.repository.ts src/modules/stats/stats.service.ts src/modules/stats/stats.module.ts src/modules/stats/stats.service.spec.ts
git commit -m "feat(stats): score/exp/rank aggregation (repo + service, real-time SQL)"
```

---

### Task 3: DTO + Controller + 앱 배선 + Swagger

**Files:**
- Create: `src/modules/stats/dto/stats.dto.ts`
- Create: `src/modules/stats/stats.controller.ts`
- Modify: `src/modules/stats/stats.module.ts` (controllers)
- Modify: `src/app.module.ts` (StatsModule 등록)

**Interfaces:**
- Consumes: Task 2 `StatsService.profile/rankings`.
- Produces: `GET /api/me/profile`, `GET /api/rankings`.

- [ ] **Step 1: DTO 작성**

`src/modules/stats/dto/stats.dto.ts`:
```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class RankingsQueryDto extends createZodDto(
  z.object({
    scope: z.enum(['NATIONAL']).default('NATIONAL'),
    period: z.enum(['CUMULATIVE', 'MONTHLY']).default('CUMULATIVE'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}
```

- [ ] **Step 2: Controller 작성**

`src/modules/stats/stats.controller.ts`:
```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { StatsService } from './stats.service';
import { RankingsQueryDto } from './dto/stats.dto';

@ApiTags('stats')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** 마이페이지 프로필 카드 (Lv/EXP/도감/순위). */
  @Get('me/profile')
  @ApiOperation({ summary: '내 프로필 (레벨/EXP/순위)' })
  profile(@CurrentUser() user: AuthUser) {
    return this.stats.profile(user.userId);
  }

  /** 전국 랭킹 (누적/이번 달). */
  @Get('rankings')
  @ApiOperation({ summary: '전국 랭킹 (누적/월간)' })
  @ApiQuery({ name: 'scope', required: false, enum: ['NATIONAL'] })
  @ApiQuery({ name: 'period', required: false, enum: ['CUMULATIVE', 'MONTHLY'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  rankings(@CurrentUser() user: AuthUser, @Query() q: RankingsQueryDto) {
    return this.stats.rankings(user.userId, q.scope, q.period, q.cursor, q.limit);
  }
}
```

- [ ] **Step 3: Module controllers + app.module 등록**

`src/modules/stats/stats.module.ts`: `controllers: [StatsController],` 추가 + import.

`src/app.module.ts`: `import { StatsModule } from '@modules/stats/stats.module';` + imports 배열에 `StatsModule,` 추가(DogamModule 아래).

- [ ] **Step 4: 전체 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 전체 통과 + 빌드 성공.

- [ ] **Step 5: 커밋**
```bash
git add src/modules/stats/ src/app.module.ts
git commit -m "feat(stats): me/profile + rankings endpoints"
```

---

## 배포/검증 (전체 구현 후)

마이그레이션 없음(조회만) — 배포는 이미지 재빌드만. 앱 구동 후:
1. score_event가 있는 유저 토큰으로 `GET /me/profile` → level/exp/expForNextLevel, nationalRank/totalUsers, dogamPercent/visitedCount.
2. score_event 없는 유저 → level 1, nationalRank null.
3. `GET /rankings?period=CUMULATIVE&limit=2` → top3, leaderboard(거리…아니 dogam%+nextCursor), me{rank,score,pointsToNext}, topPercent.
4. `?cursor=<nextCursor>` → 다음 페이지, rank 이어짐(절대 순위).
5. `?period=MONTHLY` → 이번 달 점수 기준.

## Self-Review 결과

- **스펙 커버리지:** 레벨 공식→T1, 집계 SQL(누적/월간·RANK·keyset·점수0 제외·pointsToNext·dogam배치)→T2 repo, profile/rankings 조립(topPercent·top3·me·nextCursor)→T2 service, 엔드포인트/DTO/Swagger→T3. dogam 재사용·avatarUrl null·badge null 반영. 누락 없음.
- **Placeholder:** 없음 — 모든 스텝 실제 코드/명령/기대값. (배포 §3의 오타 '거리…아니'는 문서 코멘트, 코드 아님 — dogam%로 읽을 것.)
- **타입 일관성:** `RankRow.score`(string, 커서 exact) ↔ 서비스 `Number(r.score)`/`encodeRankCursor(r.score,...)`, `myStats` 반환 ↔ profile/rankings 사용부, `levelFromExp`(T1) ↔ profile, `DogamService.overview` ↔ 재사용, `RankingsQueryDto`(scope/period/cursor/limit) ↔ 컨트롤러→service. 테스트 수 T1 7, T2 4.
- **주의(구현 시):** ① 랭킹 raw SQL은 `db.execute<T>(sql\`...\`)`(geo 패턴), `${users}`/`${places}` 테이블 참조는 sql 태그로 보간. ② keyset 커서 점수는 **numeric 문자열**로 인코딩(float 정밀도 회피). ③ `rankedCte`를 rankPage/myStats에서 sql 조각으로 재사용.
