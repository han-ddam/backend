# Scoring 미리보기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/scoring/places/:placeId` 점수 미리보기 + 정책 테이블(score_rule, region_weight) 구현.

**Architecture:** 독립 `src/modules/scoring/` 모듈(controller+service+repository, visits/regions와 동일 패턴). 계산은 순수 함수 `score-calculator.ts`로 분리(SSOT — 후속 적립 계산이 재사용). 정책 테이블 2개는 마이그레이션 0010으로 추가하고 CERT_PHOTO=15를 시드.

**Tech Stack:** NestJS 11, Drizzle ORM(PostgreSQL), nestjs-zod, Jest. 스펙: `docs/superpowers/specs/2026-07-07-scoring-preview-design.md`

## Global Constraints

- **브랜치**: `feat/scoring-preview` (main `91a2ad8`에서 생성). 커밋 메시지에 Co-Authored-By 트레일러 금지.
- **툴체인**: node/pnpm이 기본 PATH에 없음 — 모든 빌드/테스트 전에 `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...` 사용. (`corepack pnpm lint`는 eslint 바이너리 미설치로 실패 — 환경 문제, 무시.)
- **응답 envelope**: 성공은 `{result: ...}`만, 실패는 `{error: {code, message}}`만 — 전역 인터셉터가 처리하므로 컨트롤러는 payload만 반환.
- **계산 규칙(정확값)**: `basePoints = place.base_points > 0 ? place.base_points : score_rule['CERT_PHOTO'].base_points(없으면 0)`, `regionWeight = region_weight[province]?.weight ?? 1.0`(province = `coalesce(region.parent_code, region.code)`), `rarityWeight = place.rarity_weight`, `eventMultiplier = 1.0` 상수, `estimatedPoints = round(base × region × rarity × event, 소수 1자리)`.
- **응답 필드(정확한 형태)**: `{ action: 'CERT_PHOTO', basePoints, regionWeight, rarityWeight, eventMultiplier, estimatedPoints }` — 전부 number.
- 404 메시지는 정확히 `'Place not found'` (NotFoundException). HIDDEN place도 404.
- 경로 별칭: `@db/schema`, `@platform/...`, `@modules/...` 사용(기존 코드와 동일).

---

### Task 1: 정책 테이블 스키마 + 마이그레이션 0010 (+시드)

**Files:**
- Create: `src/db/schema/scoring.ts`
- Modify: `src/db/schema/index.ts` (export 1줄 추가)
- Create(생성기): `src/db/migrations/0010_*.sql` + meta 스냅샷

**Interfaces:**
- Produces: Drizzle 테이블 `scoreRules`(score_rule: action text PK, base_points int), `regionWeights`(region_weight: region_code varchar(10) PK FK→region.code, weight numeric(4,2) default '1.00'). Task 3의 repo가 `@db/schema`에서 `scoreRules`, `regionWeights`를 import.

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout main && git checkout -b feat/scoring-preview
```

- [ ] **Step 2: 스키마 파일 작성**

`src/db/schema/scoring.ts`:
```ts
import { pgTable, text, integer, varchar, numeric } from 'drizzle-orm/pg-core';
import { regions } from './regions';

/** 액션별 기본 점수 (예: CERT_PHOTO=15). place.base_points 미설정(0) 시 fallback. */
export const scoreRules = pgTable('score_rule', {
  action: text('action').primaryKey(),
  basePoints: integer('base_points').notNull(),
});

/** 시·도(PROVINCE) 단위 지역 가중치. 미설정 지역은 1.0으로 취급(행 없음 허용). */
export const regionWeights = pgTable('region_weight', {
  regionCode: varchar('region_code', { length: 10 })
    .primaryKey()
    .references(() => regions.code),
  weight: numeric('weight', { precision: 4, scale: 2 }).notNull().default('1.00'),
});

export type ScoreRule = typeof scoreRules.$inferSelect;
export type RegionWeight = typeof regionWeights.$inferSelect;
```

`src/db/schema/index.ts`의 기존 export 목록 끝에 추가:
```ts
export * from './scoring';
```

- [ ] **Step 3: 마이그레이션 생성 + 시드 추가**

```bash
corepack pnpm db:generate --name scoring_policy
```
Expected: `src/db/migrations/0010_scoring_policy.sql` 생성(CREATE TABLE 2개 + FK).

생성된 `0010_scoring_policy.sql` **파일 끝에** 시드를 덧붙인다:
```sql
--> statement-breakpoint
INSERT INTO "score_rule" ("action", "base_points") VALUES ('CERT_PHOTO', 15) ON CONFLICT DO NOTHING;
```

- [ ] **Step 4: 빌드 + 로컬 DB 적용 검증**

```bash
corepack pnpm build
corepack pnpm db:migrate
```
Expected: 빌드 성공, `[✓] migrations applied successfully!` (NOTICE "already exists, skipping" 로그는 무해).

```bash
docker exec handdam-postgres psql -U $(docker exec handdam-postgres printenv POSTGRES_USER) -d $(docker exec handdam-postgres printenv POSTGRES_DB) -tc "select action, base_points from score_rule"
```
Expected: `CERT_PHOTO | 15`

- [ ] **Step 5: 커밋**

```bash
git add src/db/schema/scoring.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(db): add score_rule + region_weight policy tables (seed CERT_PHOTO=15)"
```

---

### Task 2: 점수 계산기 (순수 함수, TDD)

**Files:**
- Create: `src/modules/scoring/score-calculator.ts`
- Test: `src/modules/scoring/score-calculator.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface ScoreInputs {
  basePoints: number;
  regionWeight: number;
  rarityWeight: number;
  eventMultiplier: number;
}
export interface ScorePreview extends ScoreInputs {
  action: 'CERT_PHOTO';
  estimatedPoints: number;
}
export function calculateScore(action: 'CERT_PHOTO', inputs: ScoreInputs): ScorePreview;
```
Task 3의 서비스가 `calculateScore`를 호출하고 `ScorePreview`를 그대로 반환한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/modules/scoring/score-calculator.spec.ts`:
```ts
import { calculateScore } from './score-calculator';

describe('calculateScore', () => {
  it('multiplies base × region × rarity × event and echoes inputs', () => {
    const out = calculateScore('CERT_PHOTO', {
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1.0,
      eventMultiplier: 1.0,
    });
    expect(out).toEqual({
      action: 'CERT_PHOTO',
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1.0,
      eventMultiplier: 1.0,
      estimatedPoints: 22.5,
    });
  });

  it('rounds estimatedPoints to one decimal place', () => {
    const out = calculateScore('CERT_PHOTO', {
      basePoints: 10,
      regionWeight: 1.33,
      rarityWeight: 1.0,
      eventMultiplier: 1.0,
    });
    expect(out.estimatedPoints).toBe(13.3);
  });

  it('returns 0 when basePoints is 0', () => {
    const out = calculateScore('CERT_PHOTO', {
      basePoints: 0,
      regionWeight: 1.5,
      rarityWeight: 1.2,
      eventMultiplier: 1.0,
    });
    expect(out.estimatedPoints).toBe(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- score-calculator`
Expected: FAIL — `Cannot find module './score-calculator'`

- [ ] **Step 3: 구현**

`src/modules/scoring/score-calculator.ts`:
```ts
/** 점수 계산 SSOT — 미리보기와 (후속) 적립이 동일 함수를 사용한다. */
export interface ScoreInputs {
  basePoints: number;
  regionWeight: number;
  rarityWeight: number;
  eventMultiplier: number;
}

export interface ScorePreview extends ScoreInputs {
  action: 'CERT_PHOTO';
  estimatedPoints: number;
}

export function calculateScore(action: 'CERT_PHOTO', inputs: ScoreInputs): ScorePreview {
  const raw =
    inputs.basePoints * inputs.regionWeight * inputs.rarityWeight * inputs.eventMultiplier;
  return { action, ...inputs, estimatedPoints: Math.round(raw * 10) / 10 };
}
```

- [ ] **Step 4: 통과 확인**

Run: `corepack pnpm test -- score-calculator`
Expected: PASS 3/3

- [ ] **Step 5: 커밋**

```bash
git add src/modules/scoring/score-calculator.ts src/modules/scoring/score-calculator.spec.ts
git commit -m "feat(scoring): pure score calculator (base × region × rarity × event)"
```

---

### Task 3: ScoringRepository + ScoringService (TDD)

**Files:**
- Create: `src/modules/scoring/scoring.repository.ts`
- Create: `src/modules/scoring/scoring.service.ts`
- Test: `src/modules/scoring/scoring.service.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `scoreRules`/`regionWeights`(`@db/schema`), Task 2의 `calculateScore`/`ScorePreview`.
- Produces: `ScoringService.preview(placeId: string): Promise<ScorePreview>` — Task 4의 컨트롤러가 호출. Repository 시그니처:
```ts
export interface PlaceScoreRow {
  basePoints: number;
  rarityWeight: string; // numeric 컬럼은 string으로 옴
  provinceCode: string;
}
placeForScoring(placeId: string): Promise<PlaceScoreRow | null>; // ACTIVE만, region 조인
ruleBasePoints(action: string): Promise<number | null>;
regionWeight(provinceCode: string): Promise<string | null>; // numeric string
```

- [ ] **Step 1: 실패하는 서비스 테스트 작성** (repo 모킹 — 기존 visits.service.spec.ts 스타일)

`src/modules/scoring/scoring.service.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { ScoringService } from './scoring.service';

describe('ScoringService', () => {
  let repo: any;
  let service: ScoringService;

  beforeEach(() => {
    repo = {
      placeForScoring: jest.fn(),
      ruleBasePoints: jest.fn(),
      regionWeight: jest.fn(),
    };
    service = new ScoringService(repo);
  });

  it('uses place.basePoints when set (>0) without consulting score_rule', async () => {
    repo.placeForScoring.mockResolvedValue({
      basePoints: 20,
      rarityWeight: '1.20',
      provinceCode: '39',
    });
    repo.regionWeight.mockResolvedValue('1.50');
    const out = await service.preview('p1');
    expect(out.basePoints).toBe(20);
    expect(out.regionWeight).toBe(1.5);
    expect(out.rarityWeight).toBe(1.2);
    expect(out.estimatedPoints).toBe(36);
    expect(repo.ruleBasePoints).not.toHaveBeenCalled();
  });

  it('falls back to score_rule when place.basePoints is 0', async () => {
    repo.placeForScoring.mockResolvedValue({
      basePoints: 0,
      rarityWeight: '1.00',
      provinceCode: '39',
    });
    repo.ruleBasePoints.mockResolvedValue(15);
    repo.regionWeight.mockResolvedValue(null);
    const out = await service.preview('p1');
    expect(repo.ruleBasePoints).toHaveBeenCalledWith('CERT_PHOTO');
    expect(out).toEqual({
      action: 'CERT_PHOTO',
      basePoints: 15,
      regionWeight: 1,
      rarityWeight: 1,
      eventMultiplier: 1,
      estimatedPoints: 15,
    });
  });

  it('defaults basePoints to 0 when rule row is missing (defensive, no 500)', async () => {
    repo.placeForScoring.mockResolvedValue({
      basePoints: 0,
      rarityWeight: '1.00',
      provinceCode: '39',
    });
    repo.ruleBasePoints.mockResolvedValue(null);
    repo.regionWeight.mockResolvedValue(null);
    const out = await service.preview('p1');
    expect(out.estimatedPoints).toBe(0);
  });

  it('throws NotFound when place is missing or hidden', async () => {
    repo.placeForScoring.mockResolvedValue(null);
    await expect(service.preview('nope')).rejects.toThrow(NotFoundException);
    expect(repo.regionWeight).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- scoring.service`
Expected: FAIL — `Cannot find module './scoring.service'`

- [ ] **Step 3: Repository 구현**

`src/modules/scoring/scoring.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { places, regions, scoreRules, regionWeights } from '@db/schema';

export interface PlaceScoreRow {
  basePoints: number;
  rarityWeight: string; // numeric → string
  provinceCode: string;
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
      })
      .from(places)
      .innerJoin(regions, eq(regions.code, places.regionCode))
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
```

- [ ] **Step 4: Service 구현**

`src/modules/scoring/scoring.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { ScoringRepository } from './scoring.repository';
import { calculateScore, type ScorePreview } from './score-calculator';

const ACTION = 'CERT_PHOTO' as const;

@Injectable()
export class ScoringService {
  constructor(private readonly repo: ScoringRepository) {}

  /** 인증 점수 미리보기 — 유저 무관 계산(게스트 동일). */
  async preview(placeId: string): Promise<ScorePreview> {
    const place = await this.repo.placeForScoring(placeId);
    if (!place) throw new NotFoundException('Place not found');
    const basePoints =
      place.basePoints > 0
        ? place.basePoints
        : ((await this.repo.ruleBasePoints(ACTION)) ?? 0);
    const weight = await this.repo.regionWeight(place.provinceCode);
    return calculateScore(ACTION, {
      basePoints,
      regionWeight: weight === null ? 1.0 : Number(weight),
      rarityWeight: Number(place.rarityWeight),
      eventMultiplier: 1.0,
    });
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `corepack pnpm test -- scoring.service`
Expected: PASS 4/4

- [ ] **Step 6: 전체 스위트 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 기존 66 + 신규 7 = 73 pass, 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add src/modules/scoring/scoring.repository.ts src/modules/scoring/scoring.service.ts src/modules/scoring/scoring.service.spec.ts
git commit -m "feat(scoring): score preview data access + service (place-first, rule fallback)"
```

---

### Task 4: Controller + Module + 앱 배선

**Files:**
- Create: `src/modules/scoring/scoring.controller.ts`
- Create: `src/modules/scoring/scoring.module.ts`
- Modify: `src/app.module.ts` (import 배열에 `ScoringModule` 추가)

**Interfaces:**
- Consumes: Task 3의 `ScoringService.preview(placeId)`.
- Produces: `GET /api/scoring/places/:placeId` (공개, 가드 없음). placeId는 `ParseUUIDPipe`로 검증(형식 오류 400).

- [ ] **Step 1: Controller 작성**

`src/modules/scoring/scoring.controller.ts`:
```ts
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ScoringService } from './scoring.service';

@ApiTags('scoring')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoring: ScoringService) {}

  /** 여행지 인증 점수 미리보기 — 게스트 허용(유저 무관 계산). */
  @Get('places/:placeId')
  @ApiParam({ name: 'placeId', type: String })
  preview(@Param('placeId', ParseUUIDPipe) placeId: string) {
    return this.scoring.preview(placeId);
  }
}
```

- [ ] **Step 2: Module 작성 + 앱 배선**

`src/modules/scoring/scoring.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ScoringRepository } from './scoring.repository';
import { ScoringService } from './scoring.service';
import { ScoringController } from './scoring.controller';

@Module({
  controllers: [ScoringController],
  providers: [ScoringRepository, ScoringService],
  exports: [ScoringService], // 후속 인증 플로우가 적립 계산에 재사용
})
export class ScoringModule {}
```

`src/app.module.ts`: 기존 모듈 import 배열(예: `VisitsModule`, `RegionsModule` 옆)에 `ScoringModule`을 추가하고 상단에 `import { ScoringModule } from '@modules/scoring/scoring.module';` 를 추가.

- [ ] **Step 3: 전체 스위트 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 73 pass, 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/modules/scoring/scoring.controller.ts src/modules/scoring/scoring.module.ts src/app.module.ts
git commit -m "feat(scoring): GET /scoring/places/:placeId score preview endpoint"
```

---

## 배포/검증 (전체 구현 후)

1. 로컬 검증(앱 구동): `node dist/main.js` 후
   - `GET /api/scoring/places/<실제 placeId>` → `{result:{action:'CERT_PHOTO',basePoints:15,regionWeight:1,rarityWeight:1,eventMultiplier:1,estimatedPoints:15}}` (base_points=0 시드 데이터 기준, rule fallback 15).
   - `region_weight`에 행 삽입 후 재호출 → regionWeight/estimatedPoints 반영 확인.
   - 존재하지 않는 UUID → 404, UUID 형식 아님 → 400.
2. 서버 배포 시 마이그레이션 0010은 이미지 재빌드로 적용(0009와 동일 절차).

## Self-Review 결과

- **스펙 커버리지:** 데이터모델(0010+시드)→T1, 계산기→T2, fallback 규칙/province 해석/404→T3, API+Swagger+공개 접근→T4. 누락 없음.
- **Placeholder:** 없음 — 모든 스텝에 실제 코드/명령/기대값.
- **타입 일관성:** `PlaceScoreRow`(T3 repo)와 서비스 사용부 일치, `calculateScore('CERT_PHOTO', ScoreInputs)`(T2)와 T3 호출부 일치, `preview(placeId)`(T3)와 T4 컨트롤러 일치. 테스트 수 산식: T2 3개 + T3 4개 = 신규 7, 총 73.
