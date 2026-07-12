# 방문기록(visit) + Region API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자의 여행지 방문(수집) 기록을 남기고(A-min), 그 위에서 도(道) 단위 진행도·목록·추천 API를 제공한다(B). 기존 zod query API의 Swagger 표시도 고친다(C).

**Architecture:** `visit` 테이블 1개로 수집을 표현(`UNIQUE(user,place)`). 쓰기는 `POST /me/visits`(로그인 필수), 조회는 `GET /regions/:code*` 3종(선택적 인증 — 게스트는 진행도 0). progress는 실시간 COUNT. NestJS 모듈 2개(`visits`, `regions`) + 선택적 인증 가드 1개 추가.

**Tech Stack:** NestJS 10, Drizzle ORM(PostgreSQL/PostGIS), nestjs-zod, @nestjs/swagger 7, Jest, drizzle-kit, pnpm.

## Global Constraints

- 응답 envelope는 전역 인터셉터(`ResponseInterceptor`)가 `{ result }`로 감싼다 — 컨트롤러/서비스는 **payload만** 반환.
- 에러는 전역 필터(`AllExceptionsFilter`)가 `{ error:{ code, message } }`로 변환 — Nest 표준 예외(`NotFoundException`/`BadRequestException` 등)를 throw만 하면 됨.
- 글로벌 프리픽스 `api` — 컨트롤러 경로에 `api`를 붙이지 않는다(`@Controller('regions')` → `/api/regions`).
- PK는 `IdService.generate()`(UUIDv7). 직접 `uuidv7()` 호출 금지(테스트 스텁 위함).
- 다국어: `@ReqContext()`로 locale 획득, `_trans` 행을 locale 우선·KO 폴백으로 선택.
- 커서 페이지네이션은 `@platform/pagination/cursor`의 `encodeCursor`/`decodeCursor`/`buildCursorPage` 재사용. 행은 `{ createdAt: Date, id: string }` 필요, 정렬 `(createdAt DESC, id DESC)`, `limit+1` 조회.
- province 필터 규칙: `like(places.regionCode, `${code}\\_%`)` (기존 places 리포지토리와 동일 — 백슬래시 이스케이프 유지).
- 서비스는 mocked repo로 단위 테스트(리포지토리 자체는 단위 테스트하지 않음 — 기존 컨벤션). `pnpm test` = jest.
- 커밋은 코드 feature 단위로만. 설계/계획 문서(`docs/superpowers/**`)는 커밋하지 않는다.

---

### Task 1: `visit` 스키마 + 마이그레이션

**Files:**
- Create: `src/db/schema/visits.ts`
- Modify: `src/db/schema/index.ts` (배럴에 export 추가)
- Create(생성물): `src/db/migrations/*_*.sql` (drizzle-kit 자동 생성)

**Interfaces:**
- Produces: `visits` 테이블 (`id, userId, placeId, createdAt`), `UNIQUE(user_id, place_id)`. 타입 `Visit`, `NewVisit`.

- [ ] **Step 1: 스키마 파일 작성**

`src/db/schema/visits.ts`:
```ts
import {
  pgTable,
  uuid,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';

/**
 * 사용자의 여행지 방문(수집) 기록. 한 place당 1행(UNIQUE(user,place)).
 * 사진 인증/점수는 후속 단계에서 이 위에 얹는다(A-min).
 */
export const visits = pgTable(
  'visit',
  {
    id: uuid('id').primaryKey(), // UUIDv7 (IdService)
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userPlaceUq: unique('visit_user_place_uq').on(t.userId, t.placeId),
    // 도내 목록/진행도 집계용 (user 기준 조회)
    userIdx: index('visit_user_idx').on(t.userId),
  }),
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
```

- [ ] **Step 2: 배럴 export 추가**

`src/db/schema/index.ts` 맨 아래에 추가:
```ts
export * from './visits';
```

- [ ] **Step 3: 타입 컴파일 확인**

Run: `pnpm build`
Expected: 성공(에러 없음).

- [ ] **Step 4: 마이그레이션 생성**

Run: `pnpm db:generate`
Expected: `src/db/migrations/`에 새 `.sql` 파일 생성. 내용에 `CREATE TABLE "visit"`, `visit_user_place_uq` 유니크, `visit_user_idx` 인덱스, `user_id`/`place_id` FK가 포함되는지 눈으로 확인. 없으면 `.sql`에 손으로 보강하고 `_journal.json`의 `when`이 단조증가인지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/db/schema/visits.ts src/db/schema/index.ts src/db/migrations
git commit -m "feat(db): add visit table (user-place collection record)"
```

---

### Task 2: 선택적 인증 가드 + 데코레이터

**Files:**
- Create: `src/modules/auth/guards/optional-jwt-auth.guard.ts`
- Create: `src/modules/auth/decorators/optional-user.decorator.ts`
- Test: `src/modules/auth/guards/optional-jwt-auth.guard.spec.ts`
- Modify: `src/modules/auth/auth.module.ts` (providers/exports에 가드 추가)

**Interfaces:**
- Consumes: `JwtService`(from `@nestjs/jwt`), `AuthUser`, `JwtPayload` (from `../auth.types`).
- Produces: `OptionalJwtAuthGuard` (항상 `true`, 유효 토큰이면 `req.user={userId}` 세팅), `@OptionalUser()` → `AuthUser | null`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/modules/auth/guards/optional-jwt-auth.guard.spec.ts`:
```ts
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

function ctxWith(header?: string) {
  const req: any = { headers: header ? { authorization: header } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    _req: req,
  } as any;
}

describe('OptionalJwtAuthGuard', () => {
  it('sets req.user for a valid token', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }) };
    const guard = new OptionalJwtAuthGuard(jwt as any);
    const ctx = ctxWith('Bearer good');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toEqual({ userId: 'u1' });
  });

  it('allows and leaves req.user undefined when no header', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const guard = new OptionalJwtAuthGuard(jwt as any);
    const ctx = ctxWith(undefined);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toBeUndefined();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('allows (does NOT throw) when token is invalid', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('bad')) };
    const guard = new OptionalJwtAuthGuard(jwt as any);
    const ctx = ctxWith('Bearer bad');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- optional-jwt-auth.guard`
Expected: FAIL — `Cannot find module './optional-jwt-auth.guard'`.

- [ ] **Step 3: 가드 구현**

`src/modules/auth/guards/optional-jwt-auth.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser, JwtPayload } from '../auth.types';

/**
 * Bearer 토큰이 있고 유효하면 `req.user`를 세팅하고, 없거나 무효면 그냥 통과.
 * (인증 실패로 요청을 막지 않는다 — 게스트 허용 조회용.)
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return true;
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      (req as Request & { user: AuthUser }).user = { userId: payload.sub };
    } catch {
      // 무효 토큰은 게스트로 취급 — 통과.
    }
    return true;
  }
}
```

`src/modules/auth/decorators/optional-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth.types';

/** OptionalJwtAuthGuard가 세팅한 유저(없으면 null). */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    return req.user ?? null;
  },
);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test -- optional-jwt-auth.guard`
Expected: PASS (3 tests).

- [ ] **Step 5: auth 모듈에 가드 등록**

`src/modules/auth/auth.module.ts`에서 `JwtAuthGuard`가 등록된 방식과 동일하게 `OptionalJwtAuthGuard`를 `providers`와 `exports` 배열에 추가한다(파일 상단에 import 추가):
```ts
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
// providers: [ ...기존, OptionalJwtAuthGuard ]
// exports:   [ ...기존, OptionalJwtAuthGuard ]
```

- [ ] **Step 6: 빌드 + 커밋**

Run: `pnpm build` (Expected: 성공)
```bash
git add src/modules/auth/guards/optional-jwt-auth.guard.ts \
        src/modules/auth/decorators/optional-user.decorator.ts \
        src/modules/auth/guards/optional-jwt-auth.guard.spec.ts \
        src/modules/auth/auth.module.ts
git commit -m "feat(auth): add OptionalJwtAuthGuard for guest-allowed reads"
```

---

### Task 3: 방문기록 쓰기 — `POST /me/visits`

**Files:**
- Create: `src/modules/visits/visits.repository.ts`
- Create: `src/modules/visits/visits.service.ts`
- Create: `src/modules/visits/dto/visit.dto.ts`
- Create: `src/modules/visits/visits.controller.ts`
- Create: `src/modules/visits/visits.module.ts`
- Test: `src/modules/visits/visits.service.spec.ts`
- Modify: `src/app.module.ts` (imports에 `VisitsModule` 추가)

**Interfaces:**
- Consumes: `IdService.generate()`, `DRIZZLE` db, `JwtAuthGuard`, `@CurrentUser() → AuthUser`.
- Produces:
  - `VisitsRepository.placeActive(placeId: string): Promise<boolean>`
  - `VisitsRepository.record(id: string, userId: string, placeId: string): Promise<{ createdAt: Date }>`
  - `VisitsService.record(userId: string, placeId: string): Promise<{ placeId: string; visitStatus: 'VISITED'; visitedAt: string }>`

- [ ] **Step 1: 실패하는 서비스 테스트 작성**

`src/modules/visits/visits.service.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { VisitsService } from './visits.service';

describe('VisitsService', () => {
  let repo: any;
  let id: any;
  let service: VisitsService;

  beforeEach(() => {
    repo = {
      placeActive: jest.fn(),
      record: jest.fn(),
    };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    service = new VisitsService(repo, id);
  });

  it('records a new visit and returns VISITED with visitedAt', async () => {
    const when = new Date('2026-07-07T00:00:00.000Z');
    repo.placeActive.mockResolvedValue(true);
    repo.record.mockResolvedValue({ createdAt: when });
    const out = await service.record('u1', 'p1');
    expect(repo.record).toHaveBeenCalledWith('id-1', 'u1', 'p1');
    expect(out).toEqual({
      placeId: 'p1',
      visitStatus: 'VISITED',
      visitedAt: when.toISOString(),
    });
  });

  it('is idempotent — returns existing row on duplicate', async () => {
    const when = new Date('2026-07-06T00:00:00.000Z');
    repo.placeActive.mockResolvedValue(true);
    repo.record.mockResolvedValue({ createdAt: when }); // 기존 행 반환
    const out = await service.record('u1', 'p1');
    expect(out.visitedAt).toBe(when.toISOString());
  });

  it('throws NotFound when place is missing or hidden', async () => {
    repo.placeActive.mockResolvedValue(false);
    await expect(service.record('u1', 'nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(repo.record).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- visits.service`
Expected: FAIL — `Cannot find module './visits.service'`.

- [ ] **Step 3: 리포지토리 구현**

`src/modules/visits/visits.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { visits, places } from '@db/schema';

@Injectable()
export class VisitsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** ACTIVE place가 존재하는지. */
  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  /** (user,place) 방문 기록. 이미 있으면 무시하고 기존 행의 createdAt 반환. */
  async record(
    id: string,
    userId: string,
    placeId: string,
  ): Promise<{ createdAt: Date }> {
    await this.db
      .insert(visits)
      .values({ id, userId, placeId })
      .onConflictDoNothing({ target: [visits.userId, visits.placeId] });
    const [row] = await this.db
      .select({ createdAt: visits.createdAt })
      .from(visits)
      .where(and(eq(visits.userId, userId), eq(visits.placeId, placeId)));
    return row;
  }
}
```

- [ ] **Step 4: 서비스 구현**

`src/modules/visits/visits.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { IdService } from '@platform/id/id.service';
import { VisitsRepository } from './visits.repository';

export interface VisitResult {
  placeId: string;
  visitStatus: 'VISITED';
  visitedAt: string;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly repo: VisitsRepository,
    private readonly id: IdService,
  ) {}

  async record(userId: string, placeId: string): Promise<VisitResult> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    const row = await this.repo.record(this.id.generate(), userId, placeId);
    return {
      placeId,
      visitStatus: 'VISITED',
      visitedAt: row.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test -- visits.service`
Expected: PASS (3 tests).

- [ ] **Step 6: DTO + 컨트롤러 + 모듈 작성**

`src/modules/visits/dto/visit.dto.ts`:
```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateVisitDto extends createZodDto(
  z.object({
    placeId: z.string().uuid(),
  }),
) {}
```

`src/modules/visits/visits.controller.ts`:
```ts
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { VisitsService } from './visits.service';
import { CreateVisitDto } from './dto/visit.dto';

@ApiTags('visits')
@Controller('me/visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  /** 여행지 방문(수집) 기록 — 멱등. */
  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  record(@Body() dto: CreateVisitDto, @CurrentUser() user: AuthUser) {
    return this.visits.record(user.userId, dto.placeId);
  }
}
```

`src/modules/visits/visits.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { VisitsRepository } from './visits.repository';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';

@Module({
  imports: [AuthModule], // JwtAuthGuard(JwtService) 사용
  controllers: [VisitsController],
  providers: [VisitsRepository, VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
```

- [ ] **Step 7: app.module에 등록**

`src/app.module.ts`: 상단에 import 추가하고 `imports` 배열의 `PlacesModule` 뒤에 `VisitsModule` 추가:
```ts
import { VisitsModule } from '@modules/visits/visits.module';
// imports: [ ... PlacesModule, VisitsModule, AgreementsModule ]
```

- [ ] **Step 8: 빌드 + 전체 테스트 + 커밋**

Run: `pnpm build && pnpm test`
Expected: 빌드 성공, 전체 테스트 PASS.
```bash
git add src/modules/visits src/app.module.ts
git commit -m "feat(visits): POST /me/visits record collection (idempotent)"
```

---

### Task 4: Region 데이터+로직 (repository + service)

**Files:**
- Create: `src/modules/regions/regions.repository.ts`
- Create: `src/modules/regions/regions.service.ts`
- Test: `src/modules/regions/regions.service.spec.ts`

**Interfaces:**
- Consumes: `DRIZZLE` db, cursor utils, `regionTrans`/`placeTrans`/`places`/`regions`/`visits` 스키마.
- Produces (Repository):
  - `findProvince(code: string): Promise<{ code: string } | undefined>` — level=PROVINCE 존재 확인
  - `regionNames(code: string, locales: Locale[]): Promise<{ locale: string; name: string }[]>`
  - `countPlaces(code: string): Promise<number>`
  - `countVisited(userId: string, code: string): Promise<number>`
  - `listPlaces(p: { code: string; userId: string | null; onlyVisited: boolean; limit: number; cursor?: string }): Promise<Array<{ id: string; createdAt: Date; visited: boolean }>>`
  - `placeTransForMany(placeIds: string[], locales: Locale[]): Promise<{ placeId: string; locale: string; name: string; address: string | null }[]>`
  - `listRecommended(p: { code: string; userId: string | null; limit: number }): Promise<{ id: string }[]>`
- Produces (Service):
  - `getRegion(code, userId: string | null, locale): Promise<RegionDetail>`
  - `listPlaces({ code, userId, onlyVisited, locale, cursor, limit }): Promise<RegionPlacesPage>`
  - `listRecommended({ code, userId, locale, limit }): Promise<RecommendedItem[]>`
  - 타입:
    ```ts
    interface RegionDetail { code: string; name: string; description: null;
      progress: { percent: number; collected: number; total: number; remaining: number } }
    interface RegionPlaceItem { placeId: string; name: string; address: string | null;
      imageUrl: null; visitStatus: 'VISITED' | 'NONE' }
    interface RegionPlacesPage { items: RegionPlaceItem[];
      counts: { all: number; visited: number; planned: number }; nextCursor: string | null }
    interface RecommendedItem { placeId: string; name: string; address: string | null; imageUrl: null }
    ```

- [ ] **Step 1: 실패하는 서비스 테스트 작성**

`src/modules/regions/regions.service.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { RegionsService } from './regions.service';

describe('RegionsService', () => {
  let repo: any;
  let service: RegionsService;

  beforeEach(() => {
    repo = {
      findProvince: jest.fn(),
      regionNames: jest.fn(),
      countPlaces: jest.fn(),
      countVisited: jest.fn(),
      listPlaces: jest.fn(),
      placeTransForMany: jest.fn(),
      listRecommended: jest.fn(),
    };
    service = new RegionsService(repo);
  });

  describe('getRegion', () => {
    it('throws NotFound for unknown/non-province code', async () => {
      repo.findProvince.mockResolvedValue(undefined);
      await expect(service.getRegion('99', 'u1', 'KO')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('computes percent/remaining and falls back to KO name', async () => {
      repo.findProvince.mockResolvedValue({ code: '32' });
      repo.regionNames.mockResolvedValue([{ locale: 'KO', name: '강원도' }]);
      repo.countPlaces.mockResolvedValue(20);
      repo.countVisited.mockResolvedValue(8);
      const out = await service.getRegion('32', 'u1', 'EN');
      expect(out).toEqual({
        code: '32',
        name: '강원도',
        description: null,
        progress: { percent: 40, collected: 8, total: 20, remaining: 12 },
      });
    });

    it('guest sees collected 0 and percent 0 (total 0 safe)', async () => {
      repo.findProvince.mockResolvedValue({ code: '32' });
      repo.regionNames.mockResolvedValue([{ locale: 'KO', name: '강원도' }]);
      repo.countPlaces.mockResolvedValue(0);
      repo.countVisited.mockResolvedValue(0);
      const out = await service.getRegion('32', null, 'KO');
      expect(out.progress).toEqual({
        percent: 0,
        collected: 0,
        total: 0,
        remaining: 0,
      });
      expect(repo.countVisited).not.toHaveBeenCalled();
    });
  });

  describe('listPlaces', () => {
    it('maps visitStatus and builds counts + nextCursor', async () => {
      repo.listPlaces.mockResolvedValue([
        { id: 'p1', createdAt: new Date('2026-07-07T00:00:00Z'), visited: true },
      ]);
      repo.placeTransForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초' },
      ]);
      repo.countPlaces.mockResolvedValue(5);
      repo.countVisited.mockResolvedValue(1);
      const out = await service.listPlaces({
        code: '32',
        userId: 'u1',
        onlyVisited: false,
        locale: 'KO',
        limit: 20,
      });
      expect(out.items[0]).toEqual({
        placeId: 'p1',
        name: '영금정',
        address: '속초',
        imageUrl: null,
        visitStatus: 'VISITED',
      });
      expect(out.counts).toEqual({ all: 5, visited: 1, planned: 0 });
      expect(out.nextCursor).toBeNull();
    });
  });

  describe('listRecommended', () => {
    it('maps recommended items with null imageUrl', async () => {
      repo.listRecommended.mockResolvedValue([{ id: 'p2' }]);
      repo.placeTransForMany.mockResolvedValue([
        { placeId: 'p2', locale: 'KO', name: '설악산', address: '속초' },
      ]);
      const out = await service.listRecommended({
        code: '32',
        userId: 'u1',
        locale: 'KO',
        limit: 1,
      });
      expect(out).toEqual([
        { placeId: 'p2', name: '설악산', address: '속초', imageUrl: null },
      ]);
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- regions.service`
Expected: FAIL — `Cannot find module './regions.service'`.

- [ ] **Step 3: 리포지토리 구현**

`src/modules/regions/regions.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
  like,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { decodeCursor } from '@platform/pagination/cursor';
import {
  regions,
  regionTrans,
  places,
  placeTrans,
  visits,
  type localeEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class RegionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findProvince(code: string): Promise<{ code: string } | undefined> {
    const [row] = await this.db
      .select({ code: regions.code })
      .from(regions)
      .where(and(eq(regions.code, code), eq(regions.level, 'PROVINCE')));
    return row;
  }

  async regionNames(
    code: string,
    locales: Locale[],
  ): Promise<{ locale: string; name: string }[]> {
    return this.db
      .select({ locale: regionTrans.locale, name: regionTrans.name })
      .from(regionTrans)
      .where(
        and(
          eq(regionTrans.regionCode, code),
          inArray(regionTrans.locale, locales),
        ),
      );
  }

  async countPlaces(code: string): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(places)
      .where(
        and(
          like(places.regionCode, `${code}\\_%`),
          eq(places.status, 'ACTIVE'),
        ),
      );
    return Number(value);
  }

  async countVisited(userId: string, code: string): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: sql<number>`count(distinct ${visits.placeId})::int` })
      .from(visits)
      .innerJoin(places, eq(places.id, visits.placeId))
      .where(
        and(
          eq(visits.userId, userId),
          like(places.regionCode, `${code}\\_%`),
          eq(places.status, 'ACTIVE'),
        ),
      );
    return Number(value);
  }

  async listPlaces(p: {
    code: string;
    userId: string | null;
    onlyVisited: boolean;
    limit: number;
    cursor?: string;
  }): Promise<Array<{ id: string; createdAt: Date; visited: boolean }>> {
    const c = decodeCursor(p.cursor);
    const conds = [
      like(places.regionCode, `${p.code}\\_%`),
      eq(places.status, 'ACTIVE'),
    ];
    if (c) {
      conds.push(
        or(
          lt(places.createdAt, c.createdAt),
          and(eq(places.createdAt, c.createdAt), lt(places.id, c.id)),
        )!,
      );
    }
    // 방문 여부: 로그인 시 해당 user의 visit 유무, 게스트는 항상 false.
    const visited = p.userId
      ? sql<boolean>`${visits.id} is not null`
      : sql<boolean>`false`;
    let q = this.db
      .select({ id: places.id, createdAt: places.createdAt, visited })
      .from(places)
      .$dynamic();
    if (p.userId) {
      q = q.leftJoin(
        visits,
        and(eq(visits.placeId, places.id), eq(visits.userId, p.userId)),
      );
      if (p.onlyVisited) conds.push(sql`${visits.id} is not null`);
    }
    return q
      .where(and(...conds))
      .orderBy(desc(places.createdAt), desc(places.id))
      .limit(p.limit + 1);
  }

  async placeTransForMany(
    placeIds: string[],
    locales: Locale[],
  ): Promise<
    { placeId: string; locale: string; name: string; address: string | null }[]
  > {
    if (placeIds.length === 0) return [];
    return this.db
      .select({
        placeId: placeTrans.placeId,
        locale: placeTrans.locale,
        name: placeTrans.name,
        address: placeTrans.address,
      })
      .from(placeTrans)
      .where(
        and(
          inArray(placeTrans.placeId, placeIds),
          inArray(placeTrans.locale, locales),
        ),
      );
  }

  async listRecommended(p: {
    code: string;
    userId: string | null;
    limit: number;
  }): Promise<{ id: string }[]> {
    const conds = [
      like(places.regionCode, `${p.code}\\_%`),
      eq(places.status, 'ACTIVE'),
    ];
    // 방문한 place 제외 (로그인 시).
    if (p.userId) {
      conds.push(
        sql`not exists (select 1 from ${visits} v where v.place_id = ${places.id} and v.user_id = ${p.userId})`,
      );
    }
    return this.db
      .select({ id: places.id })
      .from(places)
      .where(and(...conds))
      .orderBy(desc(places.basePoints), desc(places.id))
      .limit(p.limit);
  }
}
```

- [ ] **Step 4: 서비스 구현**

`src/modules/regions/regions.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { buildCursorPage } from '@platform/pagination/cursor';
import type { localeEnum } from '@db/schema';
import { RegionsRepository } from './regions.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface RegionDetail {
  code: string;
  name: string;
  description: null;
  progress: {
    percent: number;
    collected: number;
    total: number;
    remaining: number;
  };
}
export interface RegionPlaceItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: null;
  visitStatus: 'VISITED' | 'NONE';
}
export interface RegionPlacesPage {
  items: RegionPlaceItem[];
  counts: { all: number; visited: number; planned: number };
  nextCursor: string | null;
}
export interface RecommendedItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: null;
}

@Injectable()
export class RegionsService {
  constructor(private readonly repo: RegionsRepository) {}

  async getRegion(
    code: string,
    userId: string | null,
    locale: Locale,
  ): Promise<RegionDetail> {
    const region = await this.repo.findProvince(code);
    if (!region) throw new NotFoundException('Region not found');

    const names = await this.repo.regionNames(code, [locale, 'KO']);
    const name = this.pickName(names, locale);

    const total = await this.repo.countPlaces(code);
    const collected = userId ? await this.repo.countVisited(userId, code) : 0;
    const percent = total > 0 ? Math.round((collected / total) * 100) : 0;

    return {
      code,
      name,
      description: null,
      progress: { percent, collected, total, remaining: total - collected },
    };
  }

  async listPlaces(params: {
    code: string;
    userId: string | null;
    onlyVisited: boolean;
    locale: Locale;
    cursor?: string;
    limit: number;
  }): Promise<RegionPlacesPage> {
    const limit = Math.min(Math.max(params.limit, 1), 100);
    const rows = await this.repo.listPlaces({
      code: params.code,
      userId: params.userId,
      onlyVisited: params.onlyVisited,
      limit,
      cursor: params.cursor,
    });
    const page = buildCursorPage(rows, limit);
    const trans = await this.repo.placeTransForMany(
      page.items.map((r) => r.id),
      [params.locale, 'KO'],
    );
    const items: RegionPlaceItem[] = page.items.map((r) => {
      const t = this.pickTrans(trans, r.id, params.locale);
      return {
        placeId: r.id,
        name: t?.name ?? '',
        address: t?.address ?? null,
        imageUrl: null,
        visitStatus: r.visited ? 'VISITED' : 'NONE',
      };
    });
    const all = await this.repo.countPlaces(params.code);
    const visited = params.userId
      ? await this.repo.countVisited(params.userId, params.code)
      : 0;
    return {
      items,
      counts: { all, visited, planned: 0 },
      nextCursor: page.nextCursor,
    };
  }

  async listRecommended(params: {
    code: string;
    userId: string | null;
    locale: Locale;
    limit: number;
  }): Promise<RecommendedItem[]> {
    const limit = Math.min(Math.max(params.limit, 1), 10);
    const rows = await this.repo.listRecommended({
      code: params.code,
      userId: params.userId,
      limit,
    });
    const trans = await this.repo.placeTransForMany(
      rows.map((r) => r.id),
      [params.locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(trans, r.id, params.locale);
      return {
        placeId: r.id,
        name: t?.name ?? '',
        address: t?.address ?? null,
        imageUrl: null,
      };
    });
  }

  private pickName(
    names: { locale: string; name: string }[],
    locale: Locale,
  ): string {
    return (
      names.find((n) => n.locale === locale)?.name ??
      names.find((n) => n.locale === 'KO')?.name ??
      ''
    );
  }

  private pickTrans(
    trans: { placeId: string; locale: string; name: string; address: string | null }[],
    placeId: string,
    locale: Locale,
  ) {
    const rows = trans.filter((t) => t.placeId === placeId);
    return (
      rows.find((t) => t.locale === locale) ??
      rows.find((t) => t.locale === 'KO')
    );
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test -- regions.service`
Expected: PASS (6 tests). 실패 시 서비스/목 반환값을 대조해 수정.

- [ ] **Step 6: 빌드 + 커밋**

Run: `pnpm build` (Expected: 성공)
```bash
git add src/modules/regions/regions.repository.ts \
        src/modules/regions/regions.service.ts \
        src/modules/regions/regions.service.spec.ts
git commit -m "feat(regions): progress/list/recommended data + service logic"
```

---

### Task 5: Region HTTP — 컨트롤러 + 모듈 + Swagger

**Files:**
- Create: `src/modules/regions/dto/region.dto.ts`
- Create: `src/modules/regions/regions.controller.ts`
- Create: `src/modules/regions/regions.module.ts`
- Modify: `src/app.module.ts` (imports에 `RegionsModule` 추가)

**Interfaces:**
- Consumes: `RegionsService`(Task 4), `OptionalJwtAuthGuard`+`@OptionalUser()`(Task 2), `@ReqContext()`.
- Produces: `GET /api/regions/:code`, `GET /api/regions/:code/places`, `GET /api/regions/:code/recommended`.

- [ ] **Step 1: DTO 작성**

`src/modules/regions/dto/region.dto.ts`:
```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class RegionPlacesQueryDto extends createZodDto(
  z.object({
    status: z.enum(['ALL', 'VISITED']).default('ALL'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}

export class RecommendedQueryDto extends createZodDto(
  z.object({
    limit: z.coerce.number().int().min(1).max(10).default(1),
  }),
) {}
```

- [ ] **Step 2: 컨트롤러 작성**

`src/modules/regions/regions.controller.ts`:
```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { RegionsService } from './regions.service';
import { RegionPlacesQueryDto, RecommendedQueryDto } from './dto/region.dto';

@ApiTags('regions')
@Controller('regions')
@UseGuards(OptionalJwtAuthGuard) // 게스트 허용: 로그인 시 진행도 반영
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  /** 도(道) 헤더/진행도. */
  @Get(':code')
  getRegion(
    @Param('code') code: string,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.regions.getRegion(code, user?.userId ?? null, ctx.locale);
  }

  /** 도내 여행지 목록(필터 + 방문상태 + 카운트). */
  @Get(':code/places')
  @ApiQuery({ name: 'status', required: false, enum: ['ALL', 'VISITED'] })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listPlaces(
    @Param('code') code: string,
    @Query() q: RegionPlacesQueryDto,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.regions.listPlaces({
      code,
      userId: user?.userId ?? null,
      onlyVisited: q.status === 'VISITED',
      locale: ctx.locale,
      cursor: q.cursor,
      limit: q.limit ?? 20,
    });
  }

  /** 다음 추천(미방문). */
  @Get(':code/recommended')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listRecommended(
    @Param('code') code: string,
    @Query() q: RecommendedQueryDto,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.regions.listRecommended({
      code,
      userId: user?.userId ?? null,
      locale: ctx.locale,
      limit: q.limit,
    });
  }
}
```

- [ ] **Step 3: 모듈 작성 + 등록**

`src/modules/regions/regions.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { RegionsRepository } from './regions.repository';
import { RegionsService } from './regions.service';
import { RegionsController } from './regions.controller';

@Module({
  imports: [AuthModule], // OptionalJwtAuthGuard(JwtService) 사용
  controllers: [RegionsController],
  providers: [RegionsRepository, RegionsService],
})
export class RegionsModule {}
```

`src/app.module.ts`: 상단 import 추가 + `imports` 배열의 `VisitsModule` 뒤에 `RegionsModule` 추가:
```ts
import { RegionsModule } from '@modules/regions/regions.module';
// imports: [ ... VisitsModule, RegionsModule, AgreementsModule ]
```

- [ ] **Step 4: 빌드 + 전체 테스트**

Run: `pnpm build && pnpm test`
Expected: 빌드 성공, 전체 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/modules/regions/dto src/modules/regions/regions.controller.ts \
        src/modules/regions/regions.module.ts src/app.module.ts
git commit -m "feat(regions): GET /regions/:code (+places,+recommended) endpoints"
```

---

### Task 6: C — 기존 `GET /api/places` Swagger query 표시 수정

**Files:**
- Modify: `src/modules/places/places.controller.ts`

**Interfaces:**
- Consumes: 없음(데코레이터만 추가). 동작 변화 없음 — Swagger 문서화만.

- [ ] **Step 1: `@ApiQuery` 추가**

`src/modules/places/places.controller.ts`의 `list` 핸들러(`@Get()`)에 `@ApiQuery` 3개를 추가하고, 상단 `@nestjs/swagger` import에 `ApiQuery`를 포함:
```ts
import { ApiQuery, ApiTags } from '@nestjs/swagger';
// ...
  @Get()
  @ApiQuery({ name: 'province', required: true, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Query() q: PlaceListQueryDto, @ReqContext() ctx: RequestContext) {
    // 본문 그대로
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/modules/places/places.controller.ts
git commit -m "docs(places): expose GET /places query params in Swagger"
```

---

## 배포/검증 (전체 구현 후)

1. 마이그레이션 적용: 서버에서 `visit` 테이블 생성 (`pnpm migrate:prod` 또는 앱의 마이그레이션 절차 — Dockerfile이 `dist/db/migrations`를 포함하므로 이미지 재빌드 후 적용).
2. 재배포: `docker build -t handdam:local . && docker compose -f compose.prod.yml up -d`.
3. Swagger(`/api-docs`)에서 확인:
   - `visits`·`regions` 태그 노출, `GET /places`·`/regions/:code/places`에 쿼리 입력칸 표시.
   - `POST /me/visits`(Bearer 필요) → `{ placeId, visitStatus:'VISITED', visitedAt }`.
   - `GET /regions/39` → progress. `GET /regions/39/places?status=VISITED`. `GET /regions/39/recommended`.
4. (선택) e2e 스펙 추가는 후속 — 현재 계획은 서비스/가드 단위 테스트로 로직 검증.

## Self-Review 결과

- **스펙 커버리지:** §2 데이터모델→T1, A(POST /me/visits)→T3, B 3종→T4·T5, C→T5(신규)·T6(기존), 선택적 인증→T2, null 처리(description/imageUrl/planned)→T4·T5 서비스에 반영. 누락 없음.
- **Placeholder:** 없음(모든 스텝에 실제 코드/명령).
- **타입 일관성:** `record()`/`placeActive()`/`listPlaces()`/`countVisited()` 등 T3·T4 시그니처가 서비스 호출부와 일치. `visitStatus:'VISITED'|'NONE'`, `counts.planned:0` 일관.
