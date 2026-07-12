# 주변 관광지(places/nearby) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/places/nearby?lat=&lng=&radius=&limit=` — GPS 기준 가까운 여행지를 거리순으로 반환(인증 진입/위치 선택 화면).

**Architecture:** 기존 `places` 모듈 확장. 근접 쿼리는 `places.repository`의 기존 `nearestRegionCode`(ST_DWithin/ST_Distance) 패턴을 목록형으로 재사용, 이름은 `transForMany`+`pickTrans` 재사용. 신규 테이블 없음. GPS 원본 미저장.

**Tech Stack:** NestJS 11, Drizzle(PostgreSQL+PostGIS), nestjs-zod, Jest. 스펙: `docs/superpowers/specs/2026-07-11-places-nearby-design.md`

## Global Constraints

- **브랜치**: `feat/places-nearby` (main 최신에서 생성). Co-Authored-By 트레일러 금지.
- **툴체인**: `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...`. `lint` 실행 금지.
- **응답 envelope**: 성공 `{result:...}`만 — 컨트롤러는 payload만 반환.
- **정책(정확값)**:
  - GPS 좌표 **미저장** — 근접 판정에만 사용, 응답·로그에 원본 좌표 남기지 않음.
  - 근접: `ST_DWithin(place geography, target, radius)` — ACTIVE + 좌표 not null만, `ST_Distance` 오름차순.
  - `radius` 기본 2000·범위 1~50000, `limit` 기본 20·범위 1~100, `lat` 33~39, `lng` 124~132.
  - `distanceM` = 미터 반올림 정수. `thumbnailUrl` = 항상 null. `regionCode` = place.region_code. name/address = locale/KO 폴백(이름 없으면 '', address 없으면 null).
  - 접근 **공개**(가드 없음).
- **재사용**: `PlacesRepository.transForMany(placeIds, locales)`, `PlacesService`의 private `pickTrans(trans, locale)`(PlaceTrans[] → PlaceTrans|undefined), `@ReqContext`→`RequestContext.locale`.
- **경로 별칭**: `@db/schema`, `@platform/...`.
- 현재 테스트 기준선 101. 착수 전 `corepack pnpm test`로 재확인.

---

### Task 1: nearby 쿼리 + 서비스 (TDD)

**Files:**
- Modify: `src/modules/places/places.repository.ts` (`nearbyPlaces` 추가)
- Modify: `src/modules/places/places.service.ts` (`nearby` + `NearbyItem` 추가)
- Test: `src/modules/places/places.service.spec.ts` (nearby describe 추가 — 파일 없으면 기존 여부 확인 후 append)

**Interfaces:**
- Consumes: 기존 `transForMany`, `pickTrans`.
- Produces:
```ts
// repository
nearbyPlaces(lat: number, lng: number, radiusM: number, limit: number):
  Promise<{ id: string; regionCode: string; distanceM: number }[]>  // 거리 ASC
// service
NearbyItem = { placeId: string; name: string; address: string | null; distanceM: number; regionCode: string; thumbnailUrl: null }
PlacesService.nearby(params: { lat: number; lng: number; radius?: number; limit?: number; locale: Locale }): Promise<NearbyItem[]>
```
Task 2 컨트롤러가 `nearby` 호출.

- [ ] **Step 1: 브랜치 생성**
```bash
git checkout main && git checkout -b feat/places-nearby
```

- [ ] **Step 2: 실패하는 서비스 테스트 작성**

`src/modules/places/places.service.spec.ts` — 기존 파일이면 `beforeEach`의 repo 모킹에 `nearbyPlaces: jest.fn()`을 추가하고 아래 describe를 append(파일이 없으면 visits.service.spec.ts 스타일로 신규 생성 — repo·id 수동 모킹, `new PlacesService(repo, id)`):
```ts
  describe('nearby', () => {
    it('maps rows to items sorted by distance, rounds distanceM, thumbnailUrl null', async () => {
      repo.nearbyPlaces.mockResolvedValue([
        { id: 'p1', regionCode: '32_1', distanceM: 100.4 },
        { id: 'p2', regionCode: '32_1', distanceM: 1200.6 },
      ]);
      repo.transForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초시 A' },
        { placeId: 'p2', locale: 'KO', name: '설악산', address: null },
      ]);
      const out = await service.nearby({ lat: 38.2, lng: 128.6, locale: 'KO' });
      expect(repo.nearbyPlaces).toHaveBeenCalledWith(38.2, 128.6, 2000, 20); // 기본값
      expect(out).toEqual([
        { placeId: 'p1', name: '영금정', address: '속초시 A', distanceM: 100, regionCode: '32_1', thumbnailUrl: null },
        { placeId: 'p2', name: '설악산', address: null, distanceM: 1201, regionCode: '32_1', thumbnailUrl: null },
      ]);
    });

    it('passes explicit radius/limit and falls back name to empty string', async () => {
      repo.nearbyPlaces.mockResolvedValue([{ id: 'p3', regionCode: '39_4', distanceM: 5.2 }]);
      repo.transForMany.mockResolvedValue([]); // 이름 없음 → ''
      const out = await service.nearby({ lat: 33.4, lng: 126.5, radius: 500, limit: 5, locale: 'EN' });
      expect(repo.nearbyPlaces).toHaveBeenCalledWith(33.4, 126.5, 500, 5);
      expect(repo.transForMany).toHaveBeenCalledWith(['p3'], ['EN', 'KO']);
      expect(out).toEqual([
        { placeId: 'p3', name: '', address: null, distanceM: 5, regionCode: '39_4', thumbnailUrl: null },
      ]);
    });

    it('returns empty array when nothing is within radius', async () => {
      repo.nearbyPlaces.mockResolvedValue([]);
      const out = await service.nearby({ lat: 37, lng: 127, locale: 'KO' });
      expect(out).toEqual([]);
      expect(repo.transForMany).toHaveBeenCalledWith([], ['KO', 'KO']);
    });
  });
```

- [ ] **Step 3: 실패 확인**

Run: `corepack pnpm test -- places.service`
Expected: FAIL — `service.nearby is not a function`

- [ ] **Step 4: Repository 메서드 추가**

`src/modules/places/places.repository.ts`의 `nearestRegionCode` 아래에 추가 (import에 `isNotNull`이 이미 있음 — nearestRegionCode가 사용 중):
```ts
  /** 좌표 기준 radiusM 내 ACTIVE 장소 목록(거리 ASC). GPS 원본은 저장하지 않음. */
  async nearbyPlaces(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
  ): Promise<{ id: string; regionCode: string; distanceM: number }[]> {
    const target = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    const placePoint = sql`ST_SetSRID(ST_MakePoint(${places.lng}, ${places.lat}), 4326)::geography`;
    const rows = await this.db
      .select({
        id: places.id,
        regionCode: places.regionCode,
        distanceM: sql<number>`ST_Distance(${placePoint}, ${target})`,
      })
      .from(places)
      .where(
        and(
          eq(places.status, 'ACTIVE'),
          isNotNull(places.lat),
          isNotNull(places.lng),
          sql`ST_DWithin(${placePoint}, ${target}, ${radiusM})`,
        ),
      )
      .orderBy(sql`ST_Distance(${placePoint}, ${target})`)
      .limit(limit);
    return rows.map((r) => ({ id: r.id, regionCode: r.regionCode, distanceM: Number(r.distanceM) }));
  }
```

- [ ] **Step 5: Service 메서드 추가**

`src/modules/places/places.service.ts` — 인터페이스 추가(상단 export 영역):
```ts
export interface NearbyItem {
  placeId: string;
  name: string;
  address: string | null;
  distanceM: number;
  regionCode: string;
  thumbnailUrl: null;
}
```
`pickTrans` 위(또는 클래스 내 적절한 위치)에 메서드 추가:
```ts
  /** GPS 근접 여행지 목록 — 거리순. GPS 원본은 판정에만 쓰고 저장하지 않는다. */
  async nearby(params: {
    lat: number;
    lng: number;
    radius?: number;
    limit?: number;
    locale: Locale;
  }): Promise<NearbyItem[]> {
    const radius = params.radius ?? 2000;
    const limit = params.limit ?? 20;
    const rows = await this.repo.nearbyPlaces(params.lat, params.lng, radius, limit);
    const trans = await this.repo.transForMany(
      rows.map((r) => r.id),
      [params.locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(
        trans.filter((x) => x.placeId === r.id),
        params.locale,
      );
      return {
        placeId: r.id,
        name: t?.name ?? '',
        address: t?.address ?? null,
        distanceM: Math.round(r.distanceM),
        regionCode: r.regionCode,
        thumbnailUrl: null,
      };
    });
  }
```

- [ ] **Step 6: GREEN + 전체 + 빌드**

Run: `corepack pnpm test -- places.service` → PASS (기존 + nearby 3)
Run: `corepack pnpm test && corepack pnpm build` → 전체 통과 + 빌드 성공.

- [ ] **Step 7: 커밋**
```bash
git add src/modules/places/places.repository.ts src/modules/places/places.service.ts src/modules/places/places.service.spec.ts
git commit -m "feat(places): nearby places by GPS proximity (ST_DWithin, distance-sorted)"
```

---

### Task 2: DTO + Controller (라우트 순서 주의) + Swagger

**Files:**
- Modify: `src/modules/places/dto/place.dto.ts` (`NearbyQueryDto` 추가)
- Modify: `src/modules/places/places.controller.ts` (`@Get('nearby')` — `@Get(':id')`보다 위)

**Interfaces:**
- Consumes: Task 1의 `PlacesService.nearby`.
- Produces: `GET /api/places/nearby`.

- [ ] **Step 1: DTO 추가**

`src/modules/places/dto/place.dto.ts`의 export 영역에 추가:
```ts
export class NearbyQueryDto extends createZodDto(
  z.object({
    lat: z.coerce.number().min(33).max(39).describe('디바이스 위도(근접 판정용, 미저장)'),
    lng: z.coerce.number().min(124).max(132).describe('디바이스 경도(근접 판정용, 미저장)'),
    radius: z.coerce.number().int().min(1).max(50000).optional().describe('반경(m, 기본 2000)'),
    limit: z.coerce.number().int().min(1).max(100).optional().describe('최대 개수(기본 20)'),
  }),
) {}
```

- [ ] **Step 2: Controller 라우트 추가 (⚠️ `:id`보다 위)**

`src/modules/places/places.controller.ts`:
- import 수정: `import { PlaceListQueryDto, NearbyQueryDto } from './dto/place.dto';`
- `@Get(':id')`(`get` 핸들러) **바로 위에** 아래 라우트를 삽입 (선언 순 매칭이므로 반드시 `:id`보다 먼저):
```ts
  /** GPS 근접 주변 여행지 — 인증 진입/위치 선택. 좌표는 판정용(미저장). */
  @ApiOperation({ summary: '주변 여행지 (GPS 근접, 거리순)' })
  @Get('nearby')
  @ApiQuery({ name: 'lat', required: true, type: Number, example: 38.2 })
  @ApiQuery({ name: 'lng', required: true, type: Number, example: 128.6 })
  @ApiQuery({ name: 'radius', required: false, type: Number, example: 2000 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  nearby(@Query() q: NearbyQueryDto, @ReqContext() ctx: RequestContext) {
    return this.places.nearby({
      lat: q.lat,
      lng: q.lng,
      radius: q.radius,
      limit: q.limit,
      locale: ctx.locale,
    });
  }
```
결과 라우트 선언 순서: `@Get()`(list) → `@Get('nearby')` → `@Get(':id')`.

- [ ] **Step 3: 전체 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 전체 통과 + 빌드 성공.

- [ ] **Step 4: 커밋**
```bash
git add src/modules/places/dto/place.dto.ts src/modules/places/places.controller.ts
git commit -m "feat(places): GET /places/nearby endpoint (before :id route)"
```

---

## 배포/검증 (전체 구현 후)

마이그레이션 없음(조회만) — 배포는 이미지 재빌드만. 앱 구동 후:
1. `GET /api/places/nearby?lat=33.30&lng=126.24&radius=2000&limit=5` (제주 좌표) → 가까운 순 목록, distanceM 증가순, thumbnailUrl null.
2. `radius` 작게 → 개수 감소/빈 목록. 바다 좌표(반경 내 없음) → `{result:[]}`.
3. `GET /api/places/nearby?lat=99&lng=200` → 400(범위 밖).
4. `GET /api/places/<uuid>` 가 여전히 상세로 동작(라우트 순서 회귀 없음), `GET /api/places/nearby`가 상세로 안 빠짐.
5. `Accept-Language: EN` → 이름 영문/KO 폴백.

## Self-Review 결과

- **스펙 커버리지:** 근접 쿼리(ST_DWithin·거리ASC·ACTIVE·좌표 필터)→T1 repo, 매핑(거리반올림·locale·thumbnail null·regionCode)→T1 service, 쿼리 검증(lat/lng/radius/limit 범위·기본값)→T2 DTO + T1 service 기본값, 라우트/공개/순서→T2. GPS 미저장은 repo가 좌표를 응답에 안 넣음으로 충족. 누락 없음.
- **Placeholder:** 없음 — 모든 스텝 실제 코드/명령/기대값.
- **타입 일관성:** `nearbyPlaces` 반환 `{id,regionCode,distanceM}` ↔ service 사용부, `NearbyItem` ↔ 테스트 기대, `nearby(params)` ↔ 컨트롤러 호출, `NearbyQueryDto` 필드 ↔ 컨트롤러 매핑. `transForMany`/`pickTrans` 기존 시그니처 재사용.
- **주의(구현 시):** 라우트 선언 순서 `nearby` before `:id` 필수. DTO `z.coerce.number()`로 쿼리스트링 숫자 강제. ST_Distance 반환은 double → `Number()` 후 `Math.round`.
