# 주변 관광지(places/nearby) — 설계 (2026-07-11)

## 목적

인증 진입 / 위치 선택 화면 — 사용자 GPS 기준 가까운 여행지를 거리순으로 반환. 사용자가
택1 → placeId → 카메라/작성(인증 플로우)로 이어진다. "위치 수정" 시에도 사용.

## 범위 결정 (사용자 확정)

| 항목 | 결정 | 후속(비범위) |
|---|---|---|
| 엔드포인트 | `GET /places/nearby` 만 | `/places/:id/compositions`(구도 가이드 — 별도 기능) |
| thumbnailUrl | 항상 null | place 대표이미지 체계(place_image or 인증사진 집계, TourAPI firstimage) |
| GPS | **원본 미저장**, 근접 판정에만 사용 | — |
| 접근 | 공개(가드 없음) | — |
| 신규 테이블 | 없음 (place + place_trans 조회) | — |

## 정책

- **위치정보법(비신고 대상)**: 디바이스 GPS 좌표는 요청 처리 중 근접 판정에만 쓰고 **저장하지 않는다**.
  응답·로그에 원본 좌표를 남기지 않는다. (인증 플로우와 동일 원칙.)
- 좌표 미적재 place는 근접 대상에서 제외(빈 목록 가능).

## API

### `GET /api/places/nearby` — 공개(가드 없음)

쿼리:
```
lat   (필수, 33~39)      — 디바이스 위도
lng   (필수, 124~132)    — 디바이스 경도
radius(선택, 기본 2000, 1~50000) — 반경(m)
limit (선택, 기본 20, 1~100)      — 최대 개수
```

응답 200 (envelope — 성공은 `result`만):
```jsonc
{ "result": [
  { "placeId":"uuid", "name":"영금정", "address":"강원특별자치도 속초시 ...",
    "distanceM": 100, "regionCode":"32_1", "thumbnailUrl": null },
  { "placeId":"uuid", "name":"설악산", "address":"...", "distanceM": 1200,
    "regionCode":"32_1", "thumbnailUrl": null }
]}
```

- **정렬**: 거리 오름차순(`ST_Distance`).
- **근접**: `ST_DWithin(place 좌표 geography, target geography, radius)` — 반경 내 ACTIVE + 좌표 보유 place만.
- **distanceM**: 미터 반올림 정수.
- **name/address**: 요청 locale(place_trans), KO 폴백. 이름 없으면 `''`, address 없으면 null.
- **regionCode**: `place.region_code`(시·군·구 코드).
- **thumbnailUrl**: 항상 null (MVP).
- 반경 내 아무것도 없으면 `{ "result": [] }`.
- 쿼리 형식 오류(범위 밖 lat/lng 등) → 400.

## 아키텍처 — `places` 모듈 확장 (신규 테이블 없음)

- **`places.repository.ts`**: `nearbyPlaces(lat, lng, radiusM, limit): Promise<{ id:string; regionCode:string; distanceM:number }[]>`
  — 기존 `nearestRegionCode`의 `ST_DWithin`/`ST_Distance`/`ST_MakePoint` 패턴 재사용, 목록+거리 반환(ACTIVE + 좌표 not null, 거리 ASC, limit). place 이름은 기존 `transForMany(placeIds, locales)` 재사용.
- **`places.service.ts`**: `nearby(params): Promise<NearbyItem[]>` — repo 조회 → `transForMany`로 이름 병합(`pickTrans` 재사용) → distanceM 반올림, thumbnailUrl null.
  - `NearbyItem = { placeId:string; name:string; address:string|null; distanceM:number; regionCode:string; thumbnailUrl:null }`
- **`places.controller.ts`**: `@Get('nearby')` — **⚠️ 기존 `@Get(':id')`보다 먼저 선언**(NestJS 선언 순 매칭; 안 그러면 `:id`가 `nearby`를 uuid로 파싱해 400). `NearbyQueryDto`(zod). 공개(가드 없음, `@ReqContext` locale).
- **`dto/place.dto.ts`**: `NearbyQueryDto` 추가.

## 테스트

- **service 단위**(repo 모킹, 기존 스타일):
  - 거리순 아이템 매핑(반올림), locale 우선/KO 폴백, 이름 없음→'', thumbnailUrl null, 빈 목록(반경 내 없음).
  - repo에 넘기는 값(radius 기본 2000/limit 20 clamp)이 service에서 처리되면 그 경계도.
- repo(PostGIS 쿼리)는 빌드 + 정적 검증 + 수동 e2e (기존 관례). 라우트 순서(`nearby` before `:id`)는 수동/e2e 확인.

## 비범위 (후속)

`GET /places/:id/compositions`(구도 가이드 모델), place 대표이미지, 장소별 근접 반경 커스텀, 캐싱,
페이지네이션(현재 limit만).
