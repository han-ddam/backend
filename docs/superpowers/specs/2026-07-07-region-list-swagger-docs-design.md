# 지역 목록 API + Swagger 파라미터 설명 보강 — 설계 (2026-07-07)

## 목적

프론트가 시·도 코드표(1=서울 … 39=제주)를 API로 발견할 수 없고, Swagger의
`province`/`:code`/`:placeId` 파라미터에 설명·예시가 없어 어떤 값을 넣는지 알 수 없는
문제를 해결한다.

## 범위 결정 (사용자 확정)

- `GET /api/regions` 신규 (시·도 17개 코드·이름 목록) + 전 파라미터 Swagger 설명 보강.
- ID 체계는 현행 유지 (UUIDv7 단일 PK — int 내부키 도입 안 함).

## 1. 신규 API — `GET /api/regions` (공개, 게스트 동일)

성공 200 (envelope — 성공은 `result`만):
```jsonc
{ "result": [
  { "code": "1",  "name": "서울" },
  { "code": "2",  "name": "인천" },
  // ... PROVINCE 17개
  { "code": "39", "name": "제주특별자치도" }
]}
```

- **정렬**: `code`를 정수로 캐스팅해 오름차순 (`1,2,…,8,31,…,39`).
- **locale**: `Accept-Language` → `RequestContext.locale`, region_trans에서 해당 locale
  이름, 없으면 KO 폴백 (기존 `RegionsService.pickName` 관례와 동일).
- **개인화 없음**: progress 등 미포함 (그건 후속 `GET /me/progress/sido` 몫).
- 구현 위치: 기존 `RegionsController`에 `@Get()` 라우트 추가.
  **주의**: NestJS는 선언 순서로 매칭하므로 `@Get()`을 `@Get(':code')`보다 **위에** 선언.
- Repo: `listProvinces(locales): Promise<{code, locale, name}[]>` 1개 추가
  (region ⨝ region_trans, level='PROVINCE', locale IN (locale, 'KO')).
- Service: `listRegions(locale): Promise<{code, name}[]>` — 코드별 locale 우선/KO 폴백
  선택 후 정수 정렬.

## 2. Swagger 설명 보강 (동작 변화 없음 — 데코레이터만)

공통 문구: 시·도 코드는 `GET /api/regions`로 조회 가능함을 안내.

| 위치 | 파라미터 | 추가 내용 |
|---|---|---|
| `GET /api/places` | `@ApiQuery` province | `description: "시·도 코드 (GET /api/regions 로 조회. 예: 39=제주)"`, `example: '39'` |
| `GET /api/regions/:code` ·`/places`·`/recommended` | `@ApiParam` code | 동일 description + `example: '39'` (3개 라우트 각각) |
| `GET /api/scoring/places/:placeId` | `@ApiParam` placeId | `description: "여행지 UUID (GET /api/places 목록에서 획득)"` + example UUID |
| `POST /me/visits` | body `placeId` | zod DTO `.describe(...)` 또는 `@ApiBody` 설명: "여행지 UUID" |
| `GET /api/regions` (신규) | 응답 | `@ApiOkResponse`에 위 성공 예시 (scoring 컨트롤러의 example 스키마 관례와 동일) |

## 테스트

- **service 단위** (기존 스타일, repo 모킹):
  - locale 이름 우선 + KO 폴백 혼재 케이스.
  - 코드 정수 정렬 (`8` < `31`).
- 데코레이터 변경분은 빌드 + (수동) Swagger 확인으로 검증. e2e 후속(기존 방침).

## 비범위 (후속)

시·군·구(DISTRICT) 목록 API, 지역별 개인 진행도 포함, 응답 캐싱, `GET /api/regions/:code`
파라미터의 zod 검증 강화.
