# Scoring 미리보기 + 정책 테이블 — 설계 (2026-07-07)

## 목적

화면 3(여행지 상세)의 점수 미리보기 — "획득 별 15 · 지역 가중치 ×1.5" — 를 제공하는
`GET /api/scoring/places/:placeId`와 그 근거 정책 테이블을 구현한다.
실제 적립(score_event)·EXP·랭킹은 사진 인증 플로우와 함께 후속.

## 범위 결정 (사용자 확정)

| 결정 | 내용 |
|---|---|
| 범위 | 미리보기 + 정책 테이블만. score_event/적립/어드민 CRUD 없음 |
| basePoints 출처 | `place.base_points > 0`이면 그 값, 아니면(0=미설정) `score_rule`의 액션 기본값(CERT_PHOTO=15) |
| region_weight 단위 | 시·도(PROVINCE) 코드. 미설정 지역은 1.0 |
| eventMultiplier | 상수 1.0 (score_multiplier 테이블 생략, 이벤트 기능 후속) |

## 데이터 모델 (마이그레이션 0010)

```
score_rule
  action       text PK        -- 'CERT_PHOTO' 등 액션 식별자
  base_points  integer NOT NULL

region_weight
  region_code  varchar(10) PK, FK → region.code  -- PROVINCE 코드만 운영 규약(DB 제약 없음)
  weight       numeric(4,2) NOT NULL DEFAULT 1.00
```

- 시드(마이그레이션에 포함): `INSERT INTO score_rule (action, base_points) VALUES ('CERT_PHOTO', 15) ON CONFLICT DO NOTHING;`
- Drizzle 스키마 파일: `src/db/schema/scoring.ts`, `index.ts`에 export 추가.

## API

### `GET /api/scoring/places/:placeId` — 공개(가드 없음; 계산이 유저 무관)

성공 200 (envelope 규약 — 성공은 `result`만):
```jsonc
{ "result": {
    "action": "CERT_PHOTO",
    "basePoints": 15,
    "regionWeight": 1.5,
    "rarityWeight": 1.0,
    "eventMultiplier": 1.0,
    "estimatedPoints": 22.5   // base × region × rarity × event, 소수 1자리 반올림
}}
```

- 404 `{error:{code:"NOT_FOUND","message":"Place not found"}}`: place 없음 또는 `status='HIDDEN'`.
- placeId는 UUID 검증(`ParseUUIDPipe` 또는 기존 places 모듈과 동일 패턴) → 형식 오류는 400.
- Swagger: `@ApiTags('scoring')`, `@ApiParam({name:'placeId'})`, 응답 DTO 명시.

## 모듈 구조 — `src/modules/scoring/`

기존 visits/regions 모듈과 동일 패턴 (controller + service + repository + dto).

- **`scoring.repository.ts`**: place(basePoints·rarityWeight·regionCode·status) 조회,
  `score_rule` 액션 조회, `region_weight` province 코드 조회. 총 1~2 쿼리(조인 또는 병렬).
- **`scoring.service.ts`**: fallback 규칙 적용, 순수 계산기 호출, HIDDEN/부재 시 NotFound.
  province 해석은 repo 조인으로: `place.region_code`(DISTRICT, 예 `1_13`) → `region.parent_code`(PROVINCE, 예 `1`).
  (regions 테이블에 `parent_code` 컬럼 존재 — prefix 파싱 대신 이것을 사용.)
- **`score-calculator.ts`**: `calculateScore({basePoints, regionWeight, rarityWeight, eventMultiplier}) → {estimatedPoints, ...echo}` 순수 함수.
  numeric 컬럼의 string → number 변환과 소수 1자리 반올림을 여기서 일괄 처리.
- **`scoring.controller.ts`**: 라우트 1개, 가드 없음.
- **`scoring.module.ts`**: DrizzleModule(기존 DB 주입 패턴) 사용, `app.module.ts`에 등록.

## 계산 규칙 (SSOT)

```
basePoints      = place.base_points > 0 ? place.base_points : score_rule['CERT_PHOTO'].base_points
regionWeight    = region_weight[coalesce(region.parent_code, region.code)]?.weight ?? 1.0
                  -- region = place.region_code의 행. 정상 데이터는 DISTRICT라 parent_code 사용
rarityWeight    = place.rarity_weight
eventMultiplier = 1.0 (상수)
estimatedPoints = round1(basePoints × regionWeight × rarityWeight × eventMultiplier)
```

- `score_rule`에 CERT_PHOTO 행이 없는 경우는 시드 마이그레이션으로 방지(정상 배포에서 불가).
  방어적으로 행 부재 시 basePoints 0으로 계산(500 금지).
- 후속(인증 플로우)에서 적립 계산도 이 서비스/계산기를 재사용한다 — 미리보기와 적립 값 일치(SSOT).

## 테스트

- **계산기 단위**: 반올림(22.5, 22.45→22.5 등), 전 항 1.0, 0점.
- **서비스 단위**(repo 모킹, 기존 스타일): place 우선 vs rule fallback / region_weight 미설정→1.0 /
  HIDDEN·부재→NotFoundException / numeric string 변환.
- 컨트롤러/e2e는 후속(기존 방침과 동일 — 서비스 단위까지).

## 비범위 (후속)

score_event 원장, EXP/레벨, 랭킹, score_multiplier(이벤트/시즌), 어드민 정책 CRUD, Redis 캐시.
