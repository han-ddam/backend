# 홈 요약(화면1) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 탭 상단 — `GET /me/summary`(점수·순위·진행도) + `GET /me/progress/sido`(시·도별 %) + `GET /discovery/today`(오늘의 추천 미방문 여행지).

**Architecture:** 신규 `home` 모듈이 `StatsService`(요약 통계)·`DogamService`(진행도·시·도)를 조립하고, 자체 `HomeRepository`로 discovery(미방문 date-seed) 쿼리만 수행. `StatsService`에 누적 요약을 노출하는 작은 메서드를 추가. 신규 테이블 없음.

**Tech Stack:** NestJS 11, Drizzle(PostgreSQL), nestjs-zod, Jest. 스펙: `docs/superpowers/specs/2026-07-12-home-summary-design.md`

## Global Constraints

- **브랜치**: `feat/home-summary` (main 최신에서 생성). Co-Authored-By 트레일러 금지.
- **툴체인**: `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...`. `lint` 실행 금지.
- **응답 envelope**: 성공 `{result:...}`만 — 컨트롤러는 payload만 반환.
- **정책(정확값)**:
  - 3개 모두 로그인(JwtAuthGuard, `@CurrentUser`).
  - summary: score/nationalRank/totalUsers = `StatsService.summaryStats`(CUMULATIVE), progress = `DogamService.overview`. 미랭크 시 score 0, nationalRank null.
  - progress/sido: `DogamService.regions(userId, locale)`에서 **`locked` 필드만 제거**(17개·`Number(code)`순·locale 유지).
  - discovery/today: 미방문 ACTIVE(`NOT EXISTS(visit v: v.place_id=p.id AND v.user_id=me)`), 정렬 `md5(place_id::text || current_date::text)`(하루 고정·매일 갱신), `limit` 기본 3·범위 1~20, name/address = place_trans(locale/KO 폴백; 이름 없으면 '', address 없으면 null), imageUrl 항상 null, 없으면 `[]`.
- **경로 별칭**: `@db/schema`, `@platform/...`, `@modules/...`.
- **재사용**: `StatsService`(StatsModule export), `DogamService.overview(userId):{percent,collected,total}` / `DogamService.regions(userId,locale):RegionCard[]`(DogamModule export). `StatsRepository.myStats(userId,'CUMULATIVE'):{rank,score,totalRankers,pointsToNext}`.
- 현재 테스트 기준선 127. 착수 전 `corepack pnpm test`로 재확인.

---

### Task 1: StatsService.summaryStats (TDD)

**Files:**
- Modify: `src/modules/stats/stats.service.ts` (`summaryStats` + `SummaryStats` 추가)
- Modify: `src/modules/stats/stats.service.spec.ts` (describe 추가)

**Interfaces:**
- Consumes: `StatsRepository.myStats(userId, 'CUMULATIVE')`.
- Produces:
```ts
export interface SummaryStats { score: number; nationalRank: number | null; totalUsers: number; }
StatsService.summaryStats(userId: string): Promise<SummaryStats>
```
Task 2 HomeService가 사용.

- [ ] **Step 1: 브랜치 + 실패 테스트 추가**
```bash
git checkout main && git checkout -b feat/home-summary
```
`src/modules/stats/stats.service.spec.ts`에 describe 추가:
```ts
  describe('summaryStats', () => {
    it('maps myStats(CUMULATIVE) to {score, nationalRank, totalUsers}', async () => {
      repo.myStats.mockResolvedValue({ rank: 127, score: 315, totalRankers: 15284, pointsToNext: 18 });
      const out = await service.summaryStats('u1');
      expect(repo.myStats).toHaveBeenCalledWith('u1', 'CUMULATIVE');
      expect(out).toEqual({ score: 315, nationalRank: 127, totalUsers: 15284 });
    });
    it('nationalRank null when unranked', async () => {
      repo.myStats.mockResolvedValue({ rank: null, score: 0, totalRankers: 5, pointsToNext: 0 });
      const out = await service.summaryStats('u2');
      expect(out).toEqual({ score: 0, nationalRank: null, totalUsers: 5 });
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- stats.service`
Expected: FAIL — `service.summaryStats is not a function`

- [ ] **Step 3: 구현**

`src/modules/stats/stats.service.ts` — 인터페이스 추가(상단 export 영역):
```ts
export interface SummaryStats {
  score: number;
  nationalRank: number | null;
  totalUsers: number;
}
```
클래스에 메서드 추가:
```ts
  /** 홈 요약용 누적 통계 (raw 점수 포함). */
  async summaryStats(userId: string): Promise<SummaryStats> {
    const s = await this.repo.myStats(userId, 'CUMULATIVE');
    return { score: s.score, nationalRank: s.rank, totalUsers: s.totalRankers };
  }
```

- [ ] **Step 4: 통과 확인**

Run: `corepack pnpm test -- stats.service` → PASS (기존 + 2)

- [ ] **Step 5: 커밋**
```bash
git add src/modules/stats/stats.service.ts src/modules/stats/stats.service.spec.ts
git commit -m "feat(stats): summaryStats (cumulative score/rank/total for home)"
```

---

### Task 2: HomeRepository(discovery) + HomeService + Module (TDD)

**Files:**
- Create: `src/modules/home/home.repository.ts`
- Create: `src/modules/home/home.service.ts`
- Create: `src/modules/home/home.module.ts`
- Test: `src/modules/home/home.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 `StatsService.summaryStats`, `DogamService.overview`/`regions`.
- Produces:
```ts
// repository
discoveryToday(userId: string, limit: number): Promise<{ id: string }[]>  // 미방문 ACTIVE, date-seed 정렬
placeNames(placeIds: string[], locales: Locale[]): Promise<{ placeId: string; locale: string; name: string; address: string | null }[]>
// service
SummaryResult = { score: number; nationalRank: number | null; totalUsers: number; progress: { percent: number; collected: number; total: number } }
SidoProgress = { sidoCode: string; name: string; percent: number; collected: number; total: number }
DiscoveryItem = { placeId: string; name: string; address: string | null; imageUrl: null }
HomeService.summary(userId): Promise<SummaryResult>
HomeService.progressSido(userId, locale): Promise<SidoProgress[]>
HomeService.discoveryToday(userId, locale, limit?): Promise<DiscoveryItem[]>
```
Task 3 컨트롤러가 호출.

- [ ] **Step 1: 실패하는 서비스 테스트 작성**

`src/modules/home/home.service.spec.ts`:
```ts
import { HomeService } from './home.service';

describe('HomeService', () => {
  let repo: any, stats: any, dogam: any, service: HomeService;

  beforeEach(() => {
    repo = { discoveryToday: jest.fn(), placeNames: jest.fn() };
    stats = { summaryStats: jest.fn() };
    dogam = { overview: jest.fn(), regions: jest.fn() };
    service = new HomeService(repo, stats, dogam);
  });

  describe('summary', () => {
    it('combines stats + dogam overview', async () => {
      stats.summaryStats.mockResolvedValue({ score: 315, nationalRank: 127, totalUsers: 15284 });
      dogam.overview.mockResolvedValue({ percent: 63, collected: 102, total: 161 });
      const out = await service.summary('u1');
      expect(out).toEqual({
        score: 315, nationalRank: 127, totalUsers: 15284,
        progress: { percent: 63, collected: 102, total: 161 },
      });
    });
  });

  describe('progressSido', () => {
    it('drops the locked field from dogam.regions cards', async () => {
      dogam.regions.mockResolvedValue([
        { sidoCode: '1', name: '서울', percent: 80, collected: 8, total: 10, locked: false },
        { sidoCode: '39', name: '제주', percent: 5, collected: 2, total: 40, locked: false },
      ]);
      const out = await service.progressSido('u1', 'KO');
      expect(dogam.regions).toHaveBeenCalledWith('u1', 'KO');
      expect(out).toEqual([
        { sidoCode: '1', name: '서울', percent: 80, collected: 8, total: 10 },
        { sidoCode: '39', name: '제주', percent: 5, collected: 2, total: 40 },
      ]);
    });
  });

  describe('discoveryToday', () => {
    it('maps places with name/address (locale/KO), imageUrl null, default limit 3', async () => {
      repo.discoveryToday.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      repo.placeNames.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초 A' },
        { placeId: 'p2', locale: 'KO', name: '설악산', address: null },
      ]);
      const out = await service.discoveryToday('u1', 'KO');
      expect(repo.discoveryToday).toHaveBeenCalledWith('u1', 3);
      expect(repo.placeNames).toHaveBeenCalledWith(['p1', 'p2'], ['KO', 'KO']);
      expect(out).toEqual([
        { placeId: 'p1', name: '영금정', address: '속초 A', imageUrl: null },
        { placeId: 'p2', name: '설악산', address: null, imageUrl: null },
      ]);
    });

    it('name falls back to empty when no translation; clamps limit; empty ok', async () => {
      repo.discoveryToday.mockResolvedValue([{ id: 'p9' }]);
      repo.placeNames.mockResolvedValue([]); // 번역 없음 → name ''
      const out = await service.discoveryToday('u1', 'EN', 50); // clamp → 20
      expect(repo.discoveryToday).toHaveBeenCalledWith('u1', 20);
      expect(repo.placeNames).toHaveBeenCalledWith(['p9'], ['EN', 'KO']);
      expect(out).toEqual([{ placeId: 'p9', name: '', address: null, imageUrl: null }]);
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- home.service`
Expected: FAIL — `Cannot find module './home.service'`

- [ ] **Step 3: Repository 작성**

`src/modules/home/home.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { places, visits, placeTrans, type localeEnum } from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class HomeRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 미방문 ACTIVE 장소, 오늘 날짜 시드 정렬(하루 고정). */
  async discoveryToday(userId: string, limit: number): Promise<{ id: string }[]> {
    return this.db
      .select({ id: places.id })
      .from(places)
      .where(
        and(
          eq(places.status, 'ACTIVE'),
          sql`NOT EXISTS (SELECT 1 FROM ${visits} v WHERE v.place_id = ${places.id} AND v.user_id = ${userId})`,
        ),
      )
      .orderBy(sql`md5(${places.id}::text || current_date::text)`)
      .limit(limit);
  }

  async placeNames(
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
}
```

- [ ] **Step 4: Service 작성**

`src/modules/home/home.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { StatsService } from '@modules/stats/stats.service';
import { DogamService } from '@modules/dogam/dogam.service';
import { HomeRepository } from './home.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface SummaryResult {
  score: number;
  nationalRank: number | null;
  totalUsers: number;
  progress: { percent: number; collected: number; total: number };
}
export interface SidoProgress {
  sidoCode: string;
  name: string;
  percent: number;
  collected: number;
  total: number;
}
export interface DiscoveryItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: null;
}

@Injectable()
export class HomeService {
  constructor(
    private readonly repo: HomeRepository,
    private readonly stats: StatsService,
    private readonly dogam: DogamService,
  ) {}

  async summary(userId: string): Promise<SummaryResult> {
    const s = await this.stats.summaryStats(userId);
    const dg = await this.dogam.overview(userId);
    return {
      score: s.score,
      nationalRank: s.nationalRank,
      totalUsers: s.totalUsers,
      progress: { percent: dg.percent, collected: dg.collected, total: dg.total },
    };
  }

  async progressSido(userId: string, locale: Locale): Promise<SidoProgress[]> {
    const cards = await this.dogam.regions(userId, locale);
    return cards.map(({ sidoCode, name, percent, collected, total }) => ({
      sidoCode,
      name,
      percent,
      collected,
      total,
    }));
  }

  async discoveryToday(userId: string, locale: Locale, limit?: number): Promise<DiscoveryItem[]> {
    const lim = Math.min(Math.max(limit ?? 3, 1), 20);
    const rows = await this.repo.discoveryToday(userId, lim);
    const trans = await this.repo.placeNames(
      rows.map((r) => r.id),
      [locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(trans.filter((x) => x.placeId === r.id), locale);
      return { placeId: r.id, name: t?.name ?? '', address: t?.address ?? null, imageUrl: null };
    });
  }

  private pickTrans(
    trans: { locale: string; name: string; address: string | null }[],
    locale: Locale,
  ) {
    return trans.find((t) => t.locale === locale) ?? trans.find((t) => t.locale === 'KO');
  }
}
```

- [ ] **Step 5: Module 작성** (컨트롤러는 Task 3)

`src/modules/home/home.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { StatsModule } from '@modules/stats/stats.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { HomeRepository } from './home.repository';
import { HomeService } from './home.service';

@Module({
  imports: [AuthModule, StatsModule, DogamModule], // JwtAuthGuard, StatsService, DogamService
  providers: [HomeRepository, HomeService],
  exports: [HomeService],
})
export class HomeModule {}
```

- [ ] **Step 6: GREEN + 전체 + 빌드**

Run: `corepack pnpm test -- home.service` → PASS (summary 1 + progressSido 1 + discovery 2)
Run: `corepack pnpm test && corepack pnpm build` → 전체 통과 + 빌드 성공.

- [ ] **Step 7: 커밋**
```bash
git add src/modules/home/home.repository.ts src/modules/home/home.service.ts src/modules/home/home.module.ts src/modules/home/home.service.spec.ts
git commit -m "feat(home): summary + progress/sido + discovery (compose stats/dogam)"
```

---

### Task 3: DTO + Controller + 앱 배선 + Swagger

**Files:**
- Create: `src/modules/home/dto/home.dto.ts`
- Create: `src/modules/home/home.controller.ts`
- Modify: `src/modules/home/home.module.ts` (controllers)
- Modify: `src/app.module.ts` (HomeModule 등록)

**Interfaces:**
- Consumes: Task 2 `HomeService.summary/progressSido/discoveryToday`.
- Produces: `GET /api/me/summary`, `GET /api/me/progress/sido`, `GET /api/discovery/today`.

- [ ] **Step 1: DTO 작성**

`src/modules/home/dto/home.dto.ts`:
```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class DiscoveryQueryDto extends createZodDto(
  z.object({
    limit: z.coerce.number().int().min(1).max(20).optional(),
  }),
) {}
```

- [ ] **Step 2: Controller 작성**

`src/modules/home/home.controller.ts`:
```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { HomeService } from './home.service';
import { DiscoveryQueryDto } from './dto/home.dto';

@ApiTags('home')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  /** 홈 상단 요약 — 점수/순위/전체 진행도. */
  @Get('me/summary')
  @ApiOperation({ summary: '홈 요약 (점수/순위/진행도)' })
  summary(@CurrentUser() user: AuthUser) {
    return this.home.summary(user.userId);
  }

  /** 시·도별 진행 % (지도 색칠). */
  @Get('me/progress/sido')
  @ApiOperation({ summary: '시·도별 진행도' })
  progressSido(@CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.home.progressSido(user.userId, ctx.locale);
  }

  /** 오늘의 추천 여행지 (미방문, 날짜 로테이션). */
  @Get('discovery/today')
  @ApiOperation({ summary: '오늘의 추천 여행지' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 3 })
  discoveryToday(
    @CurrentUser() user: AuthUser,
    @Query() q: DiscoveryQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.home.discoveryToday(user.userId, ctx.locale, q.limit);
  }
}
```

- [ ] **Step 3: Module controllers + app.module 등록**

`src/modules/home/home.module.ts`: `controllers: [HomeController],` 추가 + import.

`src/app.module.ts`: `import { HomeModule } from '@modules/home/home.module';` + imports 배열에 `HomeModule,` 추가(StatsModule 아래).

- [ ] **Step 4: 전체 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 전체 통과 + 빌드 성공.

- [ ] **Step 5: 커밋**
```bash
git add src/modules/home/ src/app.module.ts
git commit -m "feat(home): me/summary + me/progress/sido + discovery/today endpoints"
```

---

## 배포/검증 (전체 구현 후)

마이그레이션 없음(조회만) — 배포는 이미지 재빌드만. 앱 구동 후 회원 토큰으로:
1. `GET /me/summary` → {score, nationalRank, totalUsers, progress}. 점수 있는 유저·없는 유저(rank null) 둘 다.
2. `GET /me/progress/sido` → 17개, locked 필드 없음, 정수순, `Accept-Language: EN` 폴백.
3. `GET /discovery/today?limit=3` → 미방문 3개, imageUrl null. 방문 기록 후 그 장소 빠짐. 같은 날 반복 호출 시 동일 목록(하루 고정).
4. `?limit=50` → 최대 20으로 클램프(개수). 미방문 없으면 `[]`.

## Self-Review 결과

- **스펙 커버리지:** summaryStats→T1, summary/progress-sido/discovery 조립+repo→T2, 3개 엔드포인트/DTO/Swagger→T3. locked 제거·date-seed·imageUrl null·로그인 반영. 누락 없음.
- **Placeholder:** 없음 — 모든 스텝 실제 코드/명령/기대값.
- **타입 일관성:** `SummaryStats`(T1) ↔ HomeService.summary 사용부, `DogamService.overview/regions` 반환 ↔ 조립, `HomeRepository.discoveryToday/placeNames` ↔ 서비스·모킹, `DiscoveryItem`/`SidoProgress`/`SummaryResult` ↔ 테스트 기대, `DiscoveryQueryDto.limit` ↔ 컨트롤러. 테스트 수 T1 2, T2 4.
- **주의(구현 시):** ① discovery 정렬은 `md5(${places.id}::text || current_date::text)` sql 조각(쿼리빌더 orderBy). ② progressSido는 dogam.regions 결과에서 구조분해로 locked만 누락(재정렬 금지 — 이미 정수순). ③ StatsModule/DogamModule은 각각 StatsService/DogamService를 export함(확인됨).
