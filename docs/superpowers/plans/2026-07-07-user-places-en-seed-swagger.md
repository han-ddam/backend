# 사용자 장소 추가 + EN 시드 준비 + Swagger summary 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/me/places`(검수 대기 사용자 장소 제출, 좌표→최근접 장소 지역 상속) + 어드민 검수 API + EN 시드 준비(places locale 파라미터화, region 정적 EN) + 전 엔드포인트 `@ApiOperation` summary.

**Architecture:** places 모듈 확장(신규 me-places 컨트롤러 + repo 메서드). PostGIS KNN으로 지역 판정. 시드는 스크립트 수정(단위테스트 없음, 수동 검증 — 기존 관례). 스펙: `docs/superpowers/specs/2026-07-07-user-places-en-seed-swagger-design.md`

**Tech Stack:** NestJS 11, Drizzle, PostGIS(3.4 — health에서 확인됨), nestjs-zod, Jest.

## Global Constraints

- **브랜치**: `feat/user-places-en-seed-swagger` (main `1587e11`에서 생성). Co-Authored-By 트레일러 금지.
- **툴체인**: `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...`. lint 실행 금지(환경 문제).
- **envelope**: 성공 `{result:...}`만 — 컨트롤러는 payload만 반환.
- **정확값**: 지역 판정 반경 **10,000m**; 좌표 검증 lat 33~39, lng 124~132; 판정 실패 시 `BadRequestException('지역을 판정할 수 없는 좌표입니다')`; 사용자 장소 초기값 `status='PENDING_REVIEW'`, `basePoints=0`, `rarityWeight='1.00'`, `tourapiContentId=null`, `createdBy=userId`.
- **Swagger summary 원칙**: 이모지 금지, 한 줄, 명사형 종결.
- 현재 테스트 74개 → 완료 후 **80개** (Task 2에서 +4, Task 3에서 +2).

---

### Task 1: 스키마 — PENDING_REVIEW + created_by (마이그레이션 0011)

**Files:**
- Modify: `src/db/schema/places.ts`
- Create(생성기): `src/db/migrations/0011_*.sql` + meta

**Interfaces:**
- Produces: `placeStatusEnum` = `['ACTIVE','HIDDEN','PENDING_REVIEW']`, `places.createdBy`(uuid null, FK users.id ON DELETE SET NULL). Task 2·3이 사용.

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout main && git checkout -b feat/user-places-en-seed-swagger
```

- [ ] **Step 2: 스키마 수정**

`src/db/schema/places.ts`:
- enum 교체: `export const placeStatusEnum = pgEnum('place_status', ['ACTIVE', 'HIDDEN', 'PENDING_REVIEW']);`
- import에 `users` 추가: `import { users } from './users';`
- `places` 테이블 `status` 필드 아래에 추가:

```ts
  // 사용자 제출 장소의 등록자 (NULL = 어드민 큐레이션/시드)
  createdBy: uuid('created_by').references(() => users.id, {
    onDelete: 'set null',
  }),
```

- [ ] **Step 3: 마이그레이션 생성 + 빌드 + 적용**

```bash
corepack pnpm db:generate --name user_places
corepack pnpm build && corepack pnpm db:migrate
```
Expected: `0011_user_places.sql` 생성(`ALTER TYPE "place_status" ADD VALUE 'PENDING_REVIEW'` + `ALTER TABLE "place" ADD COLUMN "created_by" uuid` + FK), 빌드 성공, 적용 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/db/schema/places.ts src/db/migrations/
git commit -m "feat(db): PENDING_REVIEW place status + created_by (user submissions)"
```

---

### Task 2: `POST /api/me/places` — 사용자 장소 제출 (TDD)

**Files:**
- Modify: `src/modules/places/dto/place.dto.ts` (DTO 추가)
- Modify: `src/modules/places/places.repository.ts` (`nearestRegionCode` 추가)
- Modify: `src/modules/places/places.service.ts` (`submitUserPlace` 추가)
- Modify: `src/modules/places/places.service.spec.ts` (테스트 4개 추가 — 파일이 없으면 생성, 기존 스타일: repo/id 수동 모킹)
- Create: `src/modules/places/me-places.controller.ts`
- Modify: `src/modules/places/places.module.ts` (AuthModule import + 컨트롤러 등록)

**Interfaces:**
- Consumes: Task 1의 `PENDING_REVIEW`/`createdBy`. 기존 `PlacesRepository.create(place, translations)`(어드민 생성에서 사용 중 — 시그니처를 먼저 읽고 그대로 재사용; insert values에 `status`/`createdBy`가 전달되도록 필요 시 확장).
- Produces: `PlacesService.submitUserPlace(userId: string, cmd: SubmitUserPlaceCmd): Promise<{ placeId: string; status: 'PENDING_REVIEW'; regionCode: string }>`, repo `nearestRegionCode(lat: number, lng: number, radiusM: number): Promise<string | null>`.

- [ ] **Step 1: 실패하는 서비스 테스트 작성**

`src/modules/places/places.service.spec.ts`에 추가 (기존 spec 파일 없으면 visits.service.spec.ts 스타일로 신규 생성 — repo·id 수동 모킹):

```ts
describe('submitUserPlace', () => {
  it('inherits region from nearest place and creates PENDING_REVIEW', async () => {
    repo.nearestRegionCode.mockResolvedValue('1_13');
    repo.create.mockImplementation(async (p: any) => p);
    const out = await service.submitUserPlace('u1', {
      name: '우리동네 벚꽃길',
      address: '서울 성동구',
      lat: 37.547,
      lng: 127.04,
    });
    expect(repo.nearestRegionCode).toHaveBeenCalledWith(37.547, 127.04, 10000);
    expect(out).toEqual({
      placeId: expect.any(String),
      status: 'PENDING_REVIEW',
      regionCode: '1_13',
    });
    const created = repo.create.mock.calls[0][0];
    expect(created.status).toBe('PENDING_REVIEW');
    expect(created.createdBy).toBe('u1');
    expect(created.basePoints).toBe(0);
    expect(created.tourapiContentId).toBeNull();
  });

  it('passes KO translation with name/address/description', async () => {
    repo.nearestRegionCode.mockResolvedValue('39_4');
    repo.create.mockImplementation(async (p: any) => p);
    await service.submitUserPlace('u1', {
      name: '숨은 오름',
      lat: 33.4,
      lng: 126.5,
      description: '설명',
    });
    const trans = repo.create.mock.calls[0][1];
    expect(trans).toEqual([
      { locale: 'KO', name: '숨은 오름', address: undefined, description: '설명' },
    ]);
  });

  it('rejects coordinates with no place within 10km', async () => {
    repo.nearestRegionCode.mockResolvedValue(null);
    await expect(
      service.submitUserPlace('u1', { name: 'x', lat: 37.0, lng: 125.0 }),
    ).rejects.toThrow('지역을 판정할 수 없는 좌표입니다');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('does not call create when nearest lookup throws', async () => {
    repo.nearestRegionCode.mockRejectedValue(new Error('db down'));
    await expect(
      service.submitUserPlace('u1', { name: 'x', lat: 37.0, lng: 127.0 }),
    ).rejects.toThrow('db down');
    expect(repo.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- places.service`
Expected: FAIL — `submitUserPlace is not a function` (또는 신규 파일이면 모듈 로드 실패)

- [ ] **Step 3: DTO 추가**

`src/modules/places/dto/place.dto.ts`:

```ts
export class SubmitUserPlaceDto extends createZodDto(
  z.object({
    name: z.string().min(1).max(100).describe('장소 이름'),
    address: z.string().max(200).optional().describe('주소 (선택)'),
    lat: z.number().min(33).max(39).describe('위도 (한국 범위)'),
    lng: z.number().min(124).max(132).describe('경도 (한국 범위)'),
    description: z.string().max(500).optional().describe('설명 (선택)'),
  }),
) {}
```

- [ ] **Step 4: Repository — 최근접 지역 판정**

`src/modules/places/places.repository.ts`에 추가 (drizzle `sql`, `and`, `eq`, `isNotNull` import 확인):

```ts
/** 좌표 기준 radiusM 내 최근접 ACTIVE 장소의 시·군·구 코드 (없으면 null). */
async nearestRegionCode(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<string | null> {
  const target = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  const placePoint = sql`ST_SetSRID(ST_MakePoint(${places.lng}, ${places.lat}), 4326)::geography`;
  const [row] = await this.db
    .select({ regionCode: places.regionCode })
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
    .limit(1);
  return row?.regionCode ?? null;
}
```

- [ ] **Step 5: Service — submitUserPlace**

`src/modules/places/places.service.ts`에 추가:

```ts
export interface SubmitUserPlaceCmd {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  description?: string;
}
```

```ts
/** 사용자 장소 제출 — 검수 대기(PENDING_REVIEW), 지역은 최근접 장소 상속. */
async submitUserPlace(
  userId: string,
  cmd: SubmitUserPlaceCmd,
): Promise<{ placeId: string; status: 'PENDING_REVIEW'; regionCode: string }> {
  const regionCode = await this.repo.nearestRegionCode(cmd.lat, cmd.lng, 10000);
  if (!regionCode) {
    throw new BadRequestException('지역을 판정할 수 없는 좌표입니다');
  }
  const place = await this.repo.create(
    {
      id: this.id.generate(),
      regionCode,
      tourapiContentId: null,
      lat: cmd.lat,
      lng: cmd.lng,
      basePoints: 0,
      rarityWeight: '1.00',
      tags: [],
      status: 'PENDING_REVIEW',
      createdBy: userId,
    },
    [{ locale: 'KO', name: cmd.name, address: cmd.address, description: cmd.description }],
  );
  return { placeId: place.id, status: 'PENDING_REVIEW', regionCode };
}
```

주의: 기존 `repo.create`가 `status`/`createdBy`를 insert values로 전달하지 않으면(내부에서 컬럼을 고정 구성하는 경우) values passthrough 되도록 확장하되, 어드민 `createPlace` 경로의 기존 동작(기본 ACTIVE)은 깨지 않는다.

- [ ] **Step 6: Controller + Module 배선**

`src/modules/places/me-places.controller.ts` (visits.controller.ts와 동일 가드 패턴):

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { PlacesService } from './places.service';
import { SubmitUserPlaceDto } from './dto/place.dto';

@ApiTags('places')
@Controller('me/places')
export class MePlacesController {
  constructor(private readonly places: PlacesService) {}

  /** 사용자 장소 제출 — 검수 후 공개. */
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '사용자 장소 제출 (검수 후 공개)' })
  @UseGuards(JwtAuthGuard)
  submit(@Body() dto: SubmitUserPlaceDto, @CurrentUser() user: AuthUser) {
    return this.places.submitUserPlace(user.userId, dto);
  }
}
```

`src/modules/places/places.module.ts`: `imports`에 `AuthModule` 추가(`import { AuthModule } from '@modules/auth/auth.module';`), `controllers`에 `MePlacesController` 추가.

- [ ] **Step 7: GREEN + 전체 스위트 + 빌드**

Run: `corepack pnpm test -- places.service` → PASS
Run: `corepack pnpm test && corepack pnpm build` → **78 pass**, 빌드 성공.

- [ ] **Step 8: 커밋**

```bash
git add src/modules/places/
git commit -m "feat(places): user place submission with nearest-place region inference"
```

---

### Task 3: 어드민 검수 — status 필터 + 승인/반려 (TDD)

**Files:**
- Modify: `src/modules/places/dto/place.dto.ts` (AdminPlaceListQueryDto에 status 추가 + UpdatePlaceStatusDto 신규)
- Modify: `src/modules/places/places.repository.ts` (listAll status 필터 + setStatus)
- Modify: `src/modules/places/places.service.ts` (adminList status 전달 + setPlaceStatus)
- Modify: `src/modules/places/places.service.spec.ts` (테스트 2개 추가)
- Modify: `src/modules/places/admin-places.controller.ts` (PATCH 라우트 추가)

**Interfaces:**
- Consumes: Task 1 enum, Task 2의 spec 파일.
- Produces: `GET /api/admin/places?status=PENDING_REVIEW`(선택 필터), `PATCH /api/admin/places/:id/status` body `{status:'ACTIVE'|'HIDDEN'}` → `{ id, status }`. `PlacesService.setPlaceStatus(id, status): Promise<{ id: string; status: PlaceStatus }>`.

- [ ] **Step 1: 실패하는 테스트 추가**

`src/modules/places/places.service.spec.ts`:

```ts
describe('setPlaceStatus', () => {
  it('updates status and returns id/status', async () => {
    repo.setStatus.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
    const out = await service.setPlaceStatus('p1', 'ACTIVE');
    expect(repo.setStatus).toHaveBeenCalledWith('p1', 'ACTIVE');
    expect(out).toEqual({ id: 'p1', status: 'ACTIVE' });
  });

  it('throws NotFound when place does not exist', async () => {
    repo.setStatus.mockResolvedValue(undefined);
    await expect(service.setPlaceStatus('nope', 'HIDDEN')).rejects.toThrow(
      'Place not found',
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- places.service`
Expected: FAIL — `setPlaceStatus is not a function`

- [ ] **Step 3: DTO**

`src/modules/places/dto/place.dto.ts` — `AdminPlaceListQueryDto`의 zod 객체에 한 줄 추가:

```ts
status: z.enum(['ACTIVE', 'HIDDEN', 'PENDING_REVIEW']).optional(),
```

신규 DTO:

```ts
export class UpdatePlaceStatusDto extends createZodDto(
  z.object({ status: z.enum(['ACTIVE', 'HIDDEN']) }),
) {}
```

- [ ] **Step 4: Repository**

`src/modules/places/places.repository.ts`:
- `listAll`의 파라미터에 `status?: 'ACTIVE' | 'HIDDEN' | 'PENDING_REVIEW'`를 추가하고, 기존 where 조건 배열에 `if (p.status) conds.push(eq(places.status, p.status));` 를 기존 province 필터와 같은 방식으로 추가한다 (파일을 읽고 기존 조건 구성 방식 그대로).
- 신규 메서드:

```ts
async setStatus(
  id: string,
  status: 'ACTIVE' | 'HIDDEN',
): Promise<{ id: string; status: string } | undefined> {
  const [row] = await this.db
    .update(places)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(places.id, id))
    .returning({ id: places.id, status: places.status });
  return row;
}
```

- [ ] **Step 5: Service**

`src/modules/places/places.service.ts`:
- `adminList` 파라미터에 `status?: PlaceStatus` 추가, `repo.listAll`에 `status: params.status` 전달.
- 신규:

```ts
/** 어드민 검수 — 사용자 제출 장소 승인(ACTIVE)/반려(HIDDEN). */
async setPlaceStatus(
  id: string,
  status: 'ACTIVE' | 'HIDDEN',
): Promise<{ id: string; status: PlaceStatus }> {
  const row = await this.repo.setStatus(id, status);
  if (!row) throw new NotFoundException('Place not found');
  return { id: row.id, status: row.status as PlaceStatus };
}
```

- [ ] **Step 6: Controller**

`src/modules/places/admin-places.controller.ts` — import에 `Param`, `Patch`, `UpdatePlaceStatusDto` 추가 후:

```ts
/** 장소 상태 변경 — 사용자 제출 장소 승인/반려 포함. */
@Patch(':id/status')
setStatus(@Param('id') id: string, @Body() dto: UpdatePlaceStatusDto) {
  return this.places.setPlaceStatus(id, dto.status);
}
```

- [ ] **Step 7: GREEN + 전체 + 빌드 + 커밋**

Run: `corepack pnpm test -- places.service` → PASS. `corepack pnpm test && corepack pnpm build` → **80 pass**, 빌드 성공.

```bash
git add src/modules/places/
git commit -m "feat(admin): place status filter + approve/reject endpoint"
```

---

### Task 4: EN 시드 준비 — places locale 파라미터화 + region 정적 EN

**Files:**
- Modify: `src/db/seeds/seed-places.ts`
- Create: `src/db/seeds/seed-region-names-en.ts`
- Modify: `package.json` (`seed:regions:en` 스크립트)

**Interfaces:**
- Consumes: 없음(독립 스크립트).
- Produces: env `TOURAPI_LOCALE`(KO|EN|JA|ZH, 기본 KO)로 places 시드 locale 제어; `corepack pnpm seed:regions:en`으로 시·도 17개 EN 이름 upsert.

- [ ] **Step 1: seed-places.ts locale 파라미터화**

**검증된 사실 (2026-07-07, 실 API 대조):** EngService2의 contentId는 국문과 **다르다**
(예: 5.16도로숲터널 KOR 2740067 ↔ ENG 3091770). 단, 영문 title이 한글 원명을 마지막
괄호로 포함한다 (`"Baengnokdam Lake (한라산 백록담)"`). 또한 영문 서비스는
contentTypeId 체계도 다르다 (관광지: 국문 12 ↔ 영문 **76**).

- 상단에 `const LOCALE = (process.env.TOURAPI_LOCALE ?? 'KO') as 'KO' | 'EN' | 'JA' | 'ZH';` 추가.
- `upsertPlace`를 분기:
  - `LOCALE === 'KO'`: 기존 동작 그대로 (place upsert + trans upsert). 단 `locale: 'KO'` 하드코딩을 `locale: LOCALE`로 교체.
  - `LOCALE !== 'KO'`: **place를 새로 만들지 않는다** — 기존 place를 다음 순서로 매칭:
    1. **한글명 매칭**: title의 **마지막 괄호 그룹**에서 한글명 추출 —
       `const ko = p.title.match(/\(([^()]*)\)\s*$/)?.[1]?.trim();`
       ko가 있으면 같은 시·도 내에서 정확 일치 조회:
       `select p.id from place p join place_trans t on t.place_id=p.id and t.locale='KO' where t.name = ${ko} and p.region_code like ${areaCode + '\\_%'}` — 결과가 **정확히 1건**이면 채택.
    2. **좌표 폴백**: 1이 실패하고 p.lat/p.lng가 있으면 100m 내 최근접 ACTIVE place
       (`ST_DWithin(...geography, 100)` + `ST_Distance` 정렬 limit 1 — Task 2의 nearestRegionCode와 동일 패턴을 시드 안에서 raw로).
    3. 매칭되면 `place_trans`에 `{ placeId, locale: LOCALE, name: p.title, address: p.address }` upsert (기존 onConflictDoUpdate 패턴), 매칭 실패 시 skip 카운트 증가.
- 실행 로그에 locale·매칭 방법별 카운트 출력 (`locale=EN · byName 98 · byCoord 12 · skipped 17` 형태).
- 파일 상단 사용법 주석에 EN 실행 예 추가 (contentTypeId 주의 포함):
  `TOURAPI_LOCALE=EN TOURAPI_AREABASED_URL=https://apis.data.go.kr/B551011/EngService2/areaBasedList2 TOURAPI_CONTENT_TYPE_IDS=76 node dist/db/seeds/seed-places.js`

- [ ] **Step 2: seed-region-names-en.ts 작성**

`seed-regions.ts`의 DB 연결/에러 처리 보일러플레이트를 따라 신규 스크립트 작성. 핵심 데이터·로직:

```ts
const PROVINCE_EN: Record<string, string> = {
  '1': 'Seoul',
  '2': 'Incheon',
  '3': 'Daejeon',
  '4': 'Daegu',
  '5': 'Gwangju',
  '6': 'Busan',
  '7': 'Ulsan',
  '8': 'Sejong',
  '31': 'Gyeonggi-do',
  '32': 'Gangwon-do',
  '33': 'Chungcheongbuk-do',
  '34': 'Chungcheongnam-do',
  '35': 'Gyeongsangbuk-do',
  '36': 'Gyeongsangnam-do',
  '37': 'Jeonbuk-do',
  '38': 'Jeollanam-do',
  '39': 'Jeju',
};

for (const [code, name] of Object.entries(PROVINCE_EN)) {
  await db
    .insert(schema.regionTrans)
    .values({ regionCode: code, locale: 'EN', name })
    .onConflictDoUpdate({
      target: [schema.regionTrans.regionCode, schema.regionTrans.locale],
      set: { name },
    });
}
console.log(`region EN names seeded: ${Object.keys(PROVINCE_EN).length}`);
```

주의: region 행이 없는 코드는 FK 오류 → 먼저 `seed:regions` 실행 전제(스크립트 시작 시 region 존재 확인 후 없으면 seed-regions.ts와 동일한 에러 메시지로 종료).

- [ ] **Step 3: package.json 스크립트**

`"seed:regions"` 옆에 추가: `"seed:regions:en": "node dist/db/seeds/seed-region-names-en.js"` (기존 seed 스크립트들의 실행 방식을 확인해 동일하게 — ts 직접 실행이면 그에 맞춤).

- [ ] **Step 4: 빌드 + 로컬 실행 검증**

```bash
corepack pnpm build
corepack pnpm seed:regions:en
docker exec handdam-postgres psql -U $(docker exec handdam-postgres printenv POSTGRES_USER) -d $(docker exec handdam-postgres printenv POSTGRES_DB) -tAc "select count(*) from region_trans where locale='EN'"
```
Expected: 17.

**place EN 시드 실 실행** (키 승인 완료 — EngService2 사용 가능):
```bash
TOURAPI_LOCALE=EN TOURAPI_AREABASED_URL='https://apis.data.go.kr/B551011/EngService2/areaBasedList2' TOURAPI_CONTENT_TYPE_IDS=76 node dist/db/seeds/seed-places.js
docker exec handdam-postgres psql -U $(docker exec handdam-postgres printenv POSTGRES_USER) -d $(docker exec handdam-postgres printenv POSTGRES_DB) -tAc "select count(*) from place_trans where locale='EN'"
```
Expected: EN trans 다수 생성(byName+byCoord 카운트 합), place 총수는 **불변**(신규 생성 금지 확인: 실행 전후 `select count(*) from place` 동일).

- [ ] **Step 5: 커밋**

```bash
git add src/db/seeds/ package.json
git commit -m "feat(seed): locale-aware place seeding + static EN province names"
```

---

### Task 5: 전 엔드포인트 `@ApiOperation` summary (동작 불변)

**Files:** (전부 Modify — 각 핸들러 위에 `@ApiOperation({ summary: '...' })` 추가, `@nestjs/swagger` import에 `ApiOperation` 추가)
- `src/modules/auth/auth.controller.ts`, `src/modules/agreements/agreements.controller.ts`, `src/modules/agreements/me-agreements.controller.ts`, `src/modules/places/places.controller.ts`, `src/modules/places/admin-places.controller.ts`, `src/modules/regions/regions.controller.ts`, `src/modules/visits/visits.controller.ts`, `src/modules/scoring/scoring.controller.ts`, `src/modules/health/health.controller.ts`, `src/modules/admin/admin-auth.controller.ts`, `src/modules/admin/admin.controller.ts`, `src/modules/admin/members.controller.ts`

**Interfaces:** 없음(문서화만). Task 2의 me-places.controller.ts는 이미 summary 보유 — 건드리지 않음.

- [ ] **Step 1: summary 일괄 추가**

원칙: 이모지 금지, 한 줄, 명사형. 각 핸들러의 기존 JSDoc 주석을 참고하되 아래 문구를 그대로 사용:

| 파일 | 핸들러 | summary |
|---|---|---|
| auth.controller | kakao / naver / google | `카카오 로그인` / `네이버 로그인` / `구글 로그인` |
| auth.controller | refresh / logout / me | `토큰 재발급` / `로그아웃` / `내 인증 정보` |
| agreements.controller | current | `현행 약관 조회` |
| me-agreements.controller | create / list | `약관 동의 기록` / `내 약관 동의 이력` |
| places.controller | list / get | `여행지 목록 (시·도별, cursor)` / `여행지 상세` |
| admin-places.controller | create / list / setStatus | `여행지 등록 (어드민)` / `여행지 목록 (어드민)` / `여행지 상태 변경 (승인/반려)` |
| regions.controller | listRegions / getRegion / listPlaces / listRecommended | `시·도 코드 목록` / `시·도 상세 (수집 진행도)` / `시·도 내 여행지 목록` / `시·도 추천 여행지` |
| visits.controller | record | `여행지 방문 기록 (멱등)` |
| scoring.controller | preview | `인증 점수 미리보기` |
| health.controller | check(핸들러명 확인) | `헬스 체크` |
| admin-auth.controller | login / refresh / logout / me | `어드민 로그인` / `어드민 토큰 재발급` / `어드민 로그아웃` / `내 어드민 정보` |
| admin.controller | list / get / create / update | `관리자 목록` / `관리자 상세` / `관리자 생성` / `관리자 수정` |
| members.controller | list / get / updateStatus | `회원 목록` / `회원 상세` / `회원 상태 변경` |

(핸들러 메서드명이 표와 다르면 라우트 기준으로 매칭.)

- [ ] **Step 2: 전체 스위트 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 80 pass, 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/modules/
git commit -m "docs(api): add plain ApiOperation summaries to all endpoints"
```

---

## 배포/검증 (전체 구현 후)

1. 마이그레이션 0011 적용(로컬은 Task 1에서 완료, 서버는 배포 시).
2. 앱 구동: 회원 토큰으로 `POST /api/me/places` (실좌표) → `PENDING_REVIEW` + 상속된 regionCode 확인 → 공개 목록에 안 보임 확인 → 어드민 `PATCH /admin/places/:id/status {status:'ACTIVE'}` → 공개 목록 노출 확인.
3. 바다 좌표(lat 37, lng 124.1 등) → 400 확인.
4. `corepack pnpm seed:regions:en` 후 `Accept-Language: EN`으로 `GET /api/regions` → 영문명 확인.
5. Swagger UI에서 summary 노출 확인.

## Self-Review 결과

- **스펙 커버리지:** A 스키마→T1, API1→T2, API2→T3, B.1→T4 Step1, B.2→T4 Step2~3, C→T5(+T2 컨트롤러 자체 summary). 누락 없음.
- **Placeholder:** repo 내부 구성(create values passthrough, listAll 조건 배열)은 파일을 읽고 기존 패턴에 맞추라는 지시로 대체 — 값·시그니처·조건식은 전부 명시.
- **타입 일관성:** `nearestRegionCode(lat,lng,10000)` 호출부/정의 일치, `SubmitUserPlaceCmd` 필드=DTO 필드, `setStatus` 반환 `{id,status}`=서비스 기대값, 테스트 수 74+4+2=80.

---

### Task 6: 시드 원커맨드화 — EN 기본값 + all 스크립트 (사용자 추가 요청)

**Files:**
- Modify: `src/db/seeds/seed-places.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 4의 LOCALE 분기.
- Produces: `TOURAPI_LOCALE=EN`만으로 EN 시드 동작(URL·contentTypeId 자동), `corepack pnpm seed:places:all`, `corepack pnpm seed:regions:all`.

- [ ] **Step 1: EN 기본값**

`seed-places.ts`에서 BASE URL/CONTENT_TYPE_IDS 결정부를 locale 인지형으로:

```ts
const LOCALE_DEFAULTS: Record<string, { url: string; typeIds: string }> = {
  KO: {
    url: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
    typeIds: '12',
  },
  EN: {
    url: 'https://apis.data.go.kr/B551011/EngService2/areaBasedList2',
    typeIds: '76',
  },
};
const defaults = LOCALE_DEFAULTS[LOCALE] ?? LOCALE_DEFAULTS.KO;
const BASE = process.env.TOURAPI_AREABASED_URL ?? defaults.url;
const CONTENT_TYPE_IDS = (process.env.TOURAPI_CONTENT_TYPE_IDS ?? defaults.typeIds).split(',');
```

(기존 상수 선언을 위 형태로 교체 — env 명시가 항상 우선. 기존 doc 주석의 `node dist/...` stale 예시도 `TOURAPI_LOCALE=EN pnpm seed:places`로 교체 — Task 4 리뷰 Minor 처리.)

- [ ] **Step 2: package.json 스크립트**

```json
"seed:places:all": "pnpm seed:places && TOURAPI_LOCALE=EN pnpm seed:places",
"seed:regions:all": "pnpm seed:regions && pnpm seed:regions:en",
```

- [ ] **Step 3: 빌드 + 검증 + 커밋**

`corepack pnpm build` 성공 후, EN 기본값 동작 확인(전체 재실행 대신 페이지 1건짜리 빠른 확인이 어려우므로 `TOURAPI_LOCALE=EN corepack pnpm seed:places` 재실행 — 멱등 upsert라 안전, 카운터가 Task 4와 유사해야 함). place 총수 불변 재확인.

```bash
git add src/db/seeds/seed-places.ts package.json
git commit -m "feat(seed): locale defaults + one-command all-locale seeding"
```
