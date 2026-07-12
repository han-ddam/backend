# 설계: 방문기록(visit) + Region API (A-min + B + C)

> 작성일 2026-07-07 · 범위: `03-api-spec.md` §3(도 상세) 구현을 위한 최소 방문/수집 도메인 + Region 조회 API + Swagger query 표시 수정.
> 이 문서가 구현 기준. 상위 스펙은 `docs/pipeline/03-api-spec.md`.

## 1. 목표 / 비범위

**목표**
- 사용자가 여행지를 "방문(수집)"한 기록을 남기고(A-min), 그 위에서 도(道) 단위 진행도·목록·추천을 조회(B)한다.
- 지금 있는 zod query API가 Swagger UI에 파라미터 입력칸으로 뜨게 한다(C).

**비범위 (다음 단계로 미룸)**
- 사진 인증(S3 presigned, `POST /certifications`), GPS 근접 판정(PostGIS `ST_DWithin`), 구도 매칭.
- 점수/EXP 원장(`score_event`) 및 집계 캐시(`user_stat`). → progress는 **실시간 COUNT**로 계산.
- 찜/북마크(`PLANNED`) 개념. → `status`는 `ALL|VISITED`만.
- place 이미지(`place_image`), region 소개문(`description`). → 응답에서 `null`.

## 2. 데이터 모델

신규 파일 `src/db/schema/visits.ts`, `src/db/schema/index.ts`에 export.

```ts
export const visits = pgTable('visit', {
  id:        uuid('id').primaryKey(),               // UUIDv7 (IdService, 기존 패턴)
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  placeId:   uuid('place_id').notNull().references(() => places.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uq: unique('visit_user_place_uq').on(t.userId, t.placeId),   // 한 place = 1 수집
  // 커서/조회용 인덱스는 마이그레이션에서 (user_id, created_at, id)
}));
```

- **"수집(collected)/방문(visited)" = `visit` 행.** `UNIQUE(user_id, place_id)`로 중복 차단.
- 나중에 사진 인증이 붙으면 `certification`이 이 위에 얹히거나 `visit`을 확장(컬럼 추가)한다. A-min에선 `visit`이 수집의 단일 출처.
- 마이그레이션: drizzle-kit 생성 → journal `when` monotonic 확인. 유니크/인덱스가 자동 생성 안 되면 손으로 SQL 보강.

## 3. A — 방문기록 쓰기 (`src/modules/visits/`)

파일: `visits.module.ts`, `visits.controller.ts`, `visits.service.ts`, `visits.repository.ts`, `dto/visit.dto.ts`.

| 메서드·경로 | 요청 | 응답(payload) | 인증 |
|---|---|---|---|
| `POST /me/visits` | `{ placeId: uuid }` | `{ placeId, visitStatus: 'VISITED', visitedAt }` | **필수** `JwtAuthGuard` |

- **멱등**: 이미 `(userId, placeId)` 있으면 INSERT 충돌을 무시하고 기존 행 기준으로 응답(`ON CONFLICT DO NOTHING` 후 조회, 또는 select-then-insert). 더블탭/재시도 안전.
- `placeId`가 없거나 존재하지 않는 place면 검증 실패(400) / 404.
- 응답은 **최소 형태**(progress before/after 미포함 — 결정 2).
- `DELETE /me/visits/:placeId`(수집 취소)는 YAGNI로 제외.

## 4. B — Region 조회 (`src/modules/regions/`)

파일: `regions.module.ts`, `regions.controller.ts`, `regions.service.ts`, `regions.repository.ts`, `dto/region.dto.ts`.

`:code` = **PROVINCE 코드(areacode, 예 `32`=강원)**. 도내 여행지 = `place.regionCode LIKE '{code}_%' AND status='ACTIVE'` (기존 places 필터 규칙과 동일).

**전부 선택적 인증(`OptionalJwtAuthGuard`)** — 로그인 시 내 기준, 게스트는 collected=0 / visitStatus=NONE.

### 4.1 `GET /regions/:code`
```
{ code, name, description, progress { percent, collected, total, remaining } }
```
- `name` = `region_trans(code, locale)` KO 폴백. 없거나 PROVINCE 아님 → 404.
- `description` = **`null`** (컬럼 없음 — 결정 1).
- `total` = 도내 ACTIVE place 수. `collected` = 내 visit 있는 distinct place 수(게스트 0). `percent` = `round(collected/total*100)`(total=0이면 0). `remaining` = `total - collected`.

### 4.2 `GET /regions/:code/places?status=ALL|VISITED&cursor=&limit=`
```
{ items: [{ placeId, name, address, imageUrl, visitStatus }],
  counts: { all, visited, planned },
  nextCursor }
```
- 목록 = 도내 ACTIVE place, **커서 keyset**(`(place.created_at, place.id)` base64url, 기존 places 패턴 재사용), `limit` 기본 20 / 최대 100.
- `visitStatus` = 내 visit LEFT JOIN → 있으면 `'VISITED'` 없으면 `'NONE'`.
- `status=VISITED` → 방문한 place만. `status=ALL` → 전부. (`PLANNED` 미지원)
- `counts.all` = 도내 total, `counts.visited` = 내 collected, `counts.planned` = `0`.
- `name`/`address` = `place_trans(locale)` KO 폴백. `imageUrl` = **`null`**(place_image 없음).

### 4.3 `GET /regions/:code/recommended?limit=1`
```
[ { placeId, name, address, imageUrl } ]
```
- 아직 방문 안 한 도내 ACTIVE place를 `base_points DESC, id`로 `limit`개(기본 1, 최대 예: 10).
- 게스트는 방문기록 없음 → 도내 place를 같은 순으로 반환.
- `imageUrl` = `null`.

## 5. C — Swagger query 표시 수정

원인: `nestjs-zod@3` + `@nestjs/swagger@7`에서 `@Query()` zod DTO가 개별 쿼리 파라미터로 전개되지 않음(서버 검증은 정상).

- 신규 region 엔드포인트: 각 쿼리(`status`, `cursor`, `limit`)에 명시적 `@ApiQuery({ name, required:false, schema })` 부착.
- 기존 `GET /api/places`(원래 버그 지점): `province`(required), `cursor`, `limit`에 `@ApiQuery` 부착.
- admin 목록 등 나머지는 이번 범위 밖(선택).

## 6. 공통 / 인증

- **신규**: `src/modules/auth/guards/optional-jwt-auth.guard.ts` — 유효 토큰 있으면 `req.user` 세팅, 없으면 그냥 통과(throw 안 함). 기존 `JwtAuthGuard`(없으면 401)와 별개.
- `@CurrentUser()` 데코레이터가 optional 컨텍스트에서 `null`을 반환하도록 확인/보강.
- `@ReqContext()`로 locale 획득(기존 패턴).
- 응답 envelope(`{ result }`)·에러(`{ error:{code,message} }`)는 기존 인터셉터/필터가 처리.

## 7. 모듈 등록 / 마이그레이션

1. `visits.schema` + `regions` 조회는 기존 `regions` 스키마 재사용(테이블 추가 없음, B는 읽기만).
2. `src/db/schema/index.ts`에 `visit` export.
3. drizzle-kit 마이그레이션 1건(`visit` 테이블 + 유니크 + 인덱스).
4. `app.module.ts`에 `VisitsModule`, `RegionsModule` 등록.

## 8. 테스트 관점(요약)

- `POST /me/visits`: 최초 생성 / 중복 멱등 / 미존재 place / 미인증 401.
- `GET /regions/:code`: 로그인 progress 계산 / 게스트 0 / 미존재 code 404 / total=0 나눗셈.
- `GET /regions/:code/places`: ALL vs VISITED 필터 / 커서 페이지네이션 / counts 일치.
- `GET /regions/:code/recommended`: 방문한 것 제외 / limit / 게스트.

## 9. 결정 로그 (이 설계)

1. region `description` → 지금은 `null`(컬럼 미추가). 콘텐츠 채우기는 별도.
2. `POST /me/visits` 응답 = 최소(`{placeId, visitStatus, visitedAt}`), progress before/after 미포함.
3. 조회 API = **선택적 인증**(게스트 허용, 진행도 0). 쓰기(`POST /me/visits`)만 로그인 필수.
4. progress 계산 = 실시간 COUNT(스펙의 `user_stat` 캐시는 후속).
5. `PLANNED`·`imageUrl`·사진인증·점수는 후속 단계.
