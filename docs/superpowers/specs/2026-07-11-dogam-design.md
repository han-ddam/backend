# 도감(Dogam) 조회 MVP — 설계 (2026-07-11)

## 목적

여행 도감 탭 — 사용자가 수집한 여행지 현황을 전국/시·도별/최근순으로 조회. 기존 `visit`(수집 기록)
집계로 구현. themes(테마 컬렉션)는 별도 모델이 필요해 후속.

## 범위 결정 (사용자 확정)

| 항목 | 결정 | 후속(비범위) |
|---|---|---|
| 엔드포인트 | overview / regions / recent | themes(컬렉션 모델) |
| "수집"의 정의 | **visit 존재** = 수집됨 (`POST /me/visits` 단순 방문 또는 인증 ACCEPTED 둘 다) | — |
| recent imageUrl | 그 (user,place)의 **내 인증 사진**(certification.image_key)의 서빙 경로, 없으면 null | place 대표이미지 |
| regions 반환 | **시·도 17개 전부**(방문 0 포함), 정수 코드순 | — |
| locked | 스펙 "해금 정책 추후" → **MVP 항상 false**(필드 유지) | 해금 조건 정책 |
| 신규 테이블 | 없음 (visit+place+region+certification 조회만) | — |

## API (전부 로그인 필수 — JwtAuthGuard)

성공은 `{result:...}`만, 실패는 `{error:{code,message}}`만. `@ApiOperation` summary 포함.

### 1. `GET /api/me/dogam/overview` — 전국 수집현황
```jsonc
{ "result": { "percent": 12, "collected": 45, "total": 370 } }
```
- `total` = 전국 ACTIVE place 수, `collected` = 내가 방문한 distinct ACTIVE place 수,
  `percent` = `total>0 ? round(collected/total*100) : 0`.

### 2. `GET /api/me/dogam/regions` — 시·도별 카드
```jsonc
{ "result": [
  { "sidoCode":"1", "name":"서울", "percent":30, "collected":3, "total":10, "locked":false },
  { "sidoCode":"39", "name":"제주특별자치도", "percent":5, "collected":2, "total":40, "locked":false }
]}
```
- PROVINCE 17개 전부, `Number(sidoCode)` 오름차순. 방문 0인 도는 collected 0/percent 0.
- `name` = 요청 locale(region_trans), KO 폴백.
- province별 total = 그 시·도 산하 DISTRICT place 수(ACTIVE), collected = 내 방문 distinct.
- `locked` = MVP 상수 false.

### 3. `GET /api/me/dogam/recent?cursor=&limit=` — 최근 수집 (cursor)
```jsonc
{ "result": {
  "items": [
    { "placeId":"uuid", "name":"5.16 도로숲터널",
      "imageUrl":"/api/certifications/photos/certifications/xxx.png",
      "collectedAt":"2026-07-11T00:12:54.318Z" }
  ],
  "nextCursor": "MjAy..." }}
```
- 내 visit을 `createdAt DESC, id DESC`로 커서 페이지(limit 기본 20, max 100 — 기존 규약).
- `name` = place 이름(locale, KO 폴백). `collectedAt` = visit.createdAt.
- `imageUrl` = 그 (user,place)의 최신 certification.image_key → `/api/certifications/photos/{image_key}`.
  인증 없이 방문만 한 place는 null.
- cursor 인프라 재사용: `buildCursorPage`/`encodeCursor`/`decodeCursor` (`@platform/pagination/cursor`), visit의 `{createdAt,id}` 기준.

## 아키텍처 — `src/modules/dogam/`

신규 모듈(controller+service+repository). regions와 별개 라우트. 집계는 **자체 repository의
효율적 GROUP BY 쿼리** — regions 서비스를 17번 호출하는 N+1을 피한다.

- **`dogam.repository.ts`**:
  - `overview(userId)`: `{ collected, total }` — total = `count(*) place ACTIVE`, collected = `count(distinct place)` from visit⨝place(ACTIVE). 2 쿼리.
  - `regionProgress(userId)`: `[{ province, collected, total }]` — total: `place⨝region group by region.parent_code`(status ACTIVE); collected: `visit⨝place⨝region where user group by parent_code`. 2 쿼리(+이름은 서비스에서).
  - `provinceNames(locales)`: PROVINCE 코드·이름(regions repo의 listProvinces와 동형 — dogam 자체 구현 or 재사용). 1 쿼리.
  - `recentVisits(userId, limit, cursor)`: visit DESC 커서(limit+1), place 이름(locale) + 최신 내 cert image_key 조인. `{id,createdAt,placeId,name,imageKey}[]`.
- **`dogam.service.ts`**: overview percent 계산, regionProgress+이름 병합·정수정렬·미방문 0 채움·locked false, recent 매핑(imageUrl 조립, buildCursorPage).
- **`dogam.controller.ts`**: 3개 라우트, JwtAuthGuard, `@CurrentUser`, `@ReqContext`(locale).
- **`dogam.module.ts`**: AuthModule(JwtAuthGuard). PlatformModule(@Global)로 DRIZZLE. app.module에 등록.

## 테스트

- **service 단위**(repo 모킹, 기존 스타일):
  - overview: percent 계산(45/370→12), total 0 → percent 0.
  - regions: 17개 전부(방문 0 도 포함), `Number(code)` 정수정렬(8<31), locale 우선/KO 폴백, locked=false.
  - recent: 아이템 매핑 imageUrl 있음(경로 조립)/없음(null), collectedAt=createdAt, nextCursor 유무.
- repo는 GROUP BY/조인 쿼리 특성상 빌드+정적검증 + 수동 e2e (기존 관례).

## 비범위 (후속)

themes(컬렉션 collection/collection_place 모델), 지역 해금 정책, place 대표이미지, 마이페이지
(`/me/profile`·`/rankings`), 홈 요약(`/me/summary`·`/progress/sido`), 캐싱.
