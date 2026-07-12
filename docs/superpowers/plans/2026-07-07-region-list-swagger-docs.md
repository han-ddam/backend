# 지역 목록 API + Swagger 설명 보강 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/regions`(시·도 17개 코드·이름 목록) 신규 + 기존 province/code/placeId 파라미터 Swagger 설명·예시 보강.

**Architecture:** 기존 `regions` 모듈에 라우트/쿼리 1개씩 추가(신규 모듈 없음). Swagger 보강은 데코레이터·zod describe만 — 런타임 동작 불변.

**Tech Stack:** NestJS 11, Drizzle, nestjs-zod, Jest. 스펙: `docs/superpowers/specs/2026-07-07-region-list-swagger-docs-design.md`

## Global Constraints

- **브랜치**: `feat/region-list-swagger-docs` (main `eaade36`에서 생성). Co-Authored-By 트레일러 금지.
- **툴체인**: `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...`. (`lint`는 환경 문제로 실행 금지.)
- **응답 envelope**: 성공 `{result:...}`만 — 컨트롤러는 payload만 반환(전역 인터셉터).
- **`GET /api/regions` 응답(정확한 형태)**: `[{ code: string, name: string }]` — PROVINCE만, `Number(code)` 오름차순 정렬, 이름은 요청 locale 우선 → KO 폴백.
- **라우트 순서**: `@Get()`은 `@Get(':code')`보다 **먼저 선언** (NestJS 선언 순 매칭).
- **Swagger 공통 문구(정확값)**: `시·도 코드 (GET /api/regions 로 조회. 예: 39=제주)`, example `'39'`.
- 현재 테스트 총 73개 → 완료 후 74개(신규 service 테스트 1개).

---

### Task 1: `GET /api/regions` 시·도 목록 엔드포인트 (TDD)

**Files:**
- Modify: `src/modules/regions/regions.repository.ts` (메서드 1개 추가)
- Modify: `src/modules/regions/regions.service.ts` (인터페이스+메서드 추가)
- Modify: `src/modules/regions/regions.service.spec.ts` (테스트 1개 추가)
- Modify: `src/modules/regions/regions.controller.ts` (라우트 1개 추가 — 반드시 `:code` 라우트들보다 위)

**Interfaces:**
- Consumes: 기존 `regions`/`regionTrans` 스키마, `RegionsService.pickName`(private, 재사용).
- Produces: `RegionsService.listRegions(locale: Locale): Promise<RegionListItem[]>`, `RegionListItem = { code: string; name: string }`. Repo: `listProvinces(locales: Locale[]): Promise<{ code: string; locale: string; name: string }[]>`.

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout main && git checkout -b feat/region-list-swagger-docs
```

- [ ] **Step 2: 실패하는 서비스 테스트 추가**

`src/modules/regions/regions.service.spec.ts`의 기존 `describe('RegionsService', ...)` 안에 추가. 파일 상단 `beforeEach`의 repo 모킹 객체에 `listProvinces: jest.fn()`을 추가하고, 테스트를 덧붙인다:

```ts
it('lists provinces sorted numerically with locale preference and KO fallback', async () => {
  repo.listProvinces.mockResolvedValue([
    { code: '31', locale: 'KO', name: '경기도' },
    { code: '31', locale: 'EN', name: 'Gyeonggi-do' },
    { code: '8', locale: 'KO', name: '세종특별자치시' },
  ]);
  const out = await service.listRegions('EN');
  expect(out).toEqual([
    { code: '8', name: '세종특별자치시' }, // EN 번역 없음 → KO 폴백, 8 < 31 정수 정렬
    { code: '31', name: 'Gyeonggi-do' }, // EN 우선
  ]);
  expect(repo.listProvinces).toHaveBeenCalledWith(['EN', 'KO']);
});
```

- [ ] **Step 3: 실패 확인**

Run: `corepack pnpm test -- regions.service`
Expected: FAIL — `service.listRegions is not a function`

- [ ] **Step 4: Repository 메서드 추가**

`src/modules/regions/regions.repository.ts`의 `findProvince` 아래에 추가:

```ts
/** PROVINCE 전체 + 요청 locale/KO 이름 행 (시·도 코드표). */
async listProvinces(
  locales: Locale[],
): Promise<{ code: string; locale: string; name: string }[]> {
  return this.db
    .select({ code: regions.code, locale: regionTrans.locale, name: regionTrans.name })
    .from(regions)
    .innerJoin(regionTrans, eq(regionTrans.regionCode, regions.code))
    .where(and(eq(regions.level, 'PROVINCE'), inArray(regionTrans.locale, locales)));
}
```

- [ ] **Step 5: Service 메서드 추가**

`src/modules/regions/regions.service.ts` — 인터페이스 목록에 추가:

```ts
export interface RegionListItem {
  code: string;
  name: string;
}
```

`getRegion` 위에 메서드 추가 (기존 `pickName` 재사용):

```ts
/** 시·도 목록 — 코드·이름 (locale 우선, KO 폴백), 코드 정수 오름차순. */
async listRegions(locale: Locale): Promise<RegionListItem[]> {
  const rows = await this.repo.listProvinces([locale, 'KO']);
  const codes = [...new Set(rows.map((r) => r.code))];
  return codes
    .map((code) => ({
      code,
      name: this.pickName(rows.filter((r) => r.code === code), locale),
    }))
    .sort((a, b) => Number(a.code) - Number(b.code));
}
```

- [ ] **Step 6: Controller 라우트 추가**

`src/modules/regions/regions.controller.ts`:
- import 수정: `import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';`
- 클래스 첫 라우트로(기존 `getRegion`의 `@Get(':code')`보다 **위에**) 추가:

```ts
/** 시·도 코드표 — province 코드 발견용 (게스트 동일). */
@Get()
@ApiOkResponse({
  description: '시·도 17개 코드·이름 (전역 인터셉터가 {result: ...}로 감쌈)',
  schema: {
    example: {
      result: [
        { code: '1', name: '서울' },
        { code: '39', name: '제주특별자치도' },
      ],
    },
  },
})
listRegions(@ReqContext() ctx: RequestContext) {
  return this.regions.listRegions(ctx.locale);
}
```

- [ ] **Step 7: 통과 확인 + 전체 스위트 + 빌드**

Run: `corepack pnpm test -- regions.service`
Expected: PASS (기존 + 신규 1)

Run: `corepack pnpm test && corepack pnpm build`
Expected: 74 pass, 빌드 성공.

- [ ] **Step 8: 커밋**

```bash
git add src/modules/regions/
git commit -m "feat(regions): GET /regions province code list endpoint"
```

---

### Task 2: 기존 파라미터 Swagger 설명 보강 (동작 불변)

**Files:**
- Modify: `src/modules/places/places.controller.ts` (province @ApiQuery)
- Modify: `src/modules/regions/regions.controller.ts` (`:code` 3개 라우트에 @ApiParam)
- Modify: `src/modules/scoring/scoring.controller.ts` (placeId @ApiParam 설명)
- Modify: `src/modules/visits/dto/visit.dto.ts` (placeId describe)

**Interfaces:**
- Consumes: Task 1의 `GET /api/regions` 존재(설명 문구가 참조).
- Produces: 없음(문서화만).

- [ ] **Step 1: places province 설명**

`src/modules/places/places.controller.ts`의 `list` 핸들러에서 기존
`@ApiQuery({ name: 'province', required: true, type: String })` 를 다음으로 교체:

```ts
@ApiQuery({
  name: 'province',
  required: true,
  type: String,
  example: '39',
  description: '시·도 코드 (GET /api/regions 로 조회. 예: 39=제주)',
})
```

- [ ] **Step 2: regions `:code` 3개 라우트에 @ApiParam**

`src/modules/regions/regions.controller.ts`:
- import에 `ApiParam` 추가: `import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';`
- `getRegion`·`listPlaces`·`listRecommended` 각각의 `@Get(':code'...)` 아래에 동일하게 추가:

```ts
@ApiParam({
  name: 'code',
  example: '39',
  description: '시·도 코드 (GET /api/regions 로 조회. 예: 39=제주)',
})
```

- [ ] **Step 3: scoring placeId 설명**

`src/modules/scoring/scoring.controller.ts`의 기존
`@ApiParam({ name: 'placeId', type: String })` 을 다음으로 교체:

```ts
@ApiParam({
  name: 'placeId',
  type: String,
  example: '019eea71-dc41-7101-a57d-f6ebd3b80e43',
  description: '여행지 UUID (GET /api/places 목록에서 획득)',
})
```

- [ ] **Step 4: visits placeId describe**

`src/modules/visits/dto/visit.dto.ts`:

```ts
export class CreateVisitDto extends createZodDto(
  z.object({
    placeId: z.string().uuid().describe('여행지 UUID (GET /api/places 목록에서 획득)'),
  }),
) {}
```

- [ ] **Step 5: 전체 스위트 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 74 pass, 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/modules/places/places.controller.ts src/modules/regions/regions.controller.ts src/modules/scoring/scoring.controller.ts src/modules/visits/dto/visit.dto.ts
git commit -m "docs(api): describe province/code/placeId params in Swagger"
```

---

## 배포/검증 (전체 구현 후)

1. 앱 구동 후 `GET /api/regions` → 17개, `Accept-Language: EN`으로 이름 변화(또는 KO 폴백) 확인.
2. `/api-docs-json`에서 province/code/placeId description·example 노출 확인.
3. `GET /api/regions/39` 등 기존 `:code` 라우트가 여전히 동작(라우트 순서 회귀 없음) 확인.
4. 마이그레이션 없음 — 배포는 이미지 재빌드만.

## Self-Review 결과

- **스펙 커버리지:** §1 신규 API→T1(정렬·폴백·라우트순서·ApiOkResponse 포함), §2 표 5행→T2 Step1~4 + T1 Step6(신규 응답 예시). 누락 없음.
- **Placeholder:** 없음.
- **타입 일관성:** `listProvinces` 반환 `{code,locale,name}[]` ↔ 서비스 `pickName` 입력(`{locale,name}` 구조 포함) 호환, `listRegions(locale)` ↔ 컨트롤러 `ctx.locale` 일치.
