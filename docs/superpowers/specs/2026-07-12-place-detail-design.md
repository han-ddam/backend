# 여행지 상세 확장(화면3) + place 대표 이미지 — 설계 (2026-07-12)

## 목적

여행지 상세를 완성하고, place 목록/추천/상세에 공통으로 쓰이는 **대표 이미지**를
실데이터로 채운다. 상세는 방문 상태 + 다른 여행자 인증사진 피드를 추가.
평점(rating)은 후속.

## 핵심 결정 (사용자 확정)

1. **대표 이미지는 TourAPI에서 온다.** place는 전부 TourAPI 관광지(`tourapi_content_id`) 출처이고,
   시드가 쓰는 `areaBasedList2` 응답에 이미 `firstimage`/`firstimage2`가 있다.
   → **place에 `image_url` 컬럼 추가, 시드에서 같이 적재.** 어드민 업로드/StoragePort/새 테이블 전부 불필요.
2. **이미지는 TourAPI URL 그대로 저장(핫링크).** 재호스팅은 후속(전환 가능).
3. **이번 범위는 대표 1장.** 갤러리(detailImage2 여러 장)는 후속.
4. `imageUrl`은 상세만의 필드가 아니다 — **regions 목록/추천, home discovery가 지금 전부 `imageUrl: null`
   하드코딩.** 같이 실데이터로 바꾼다(일관성).
5. **`visitStatus`는 기존 regions와 동일한 `VISITED | NONE`.** (목업의 "방문 예정"은 프론트가 NONE을
   그렇게 라벨링. 백엔드 enum에 PLANNED 없음 — regions.service.ts:104와 통일.)
6. rating/ratingCount는 `null`/`0` placeholder. 평점 제출·집계는 후속.

## 데이터 성격 구분

| 데이터 | 출처 | 이번 범위 |
|---|---|---|
| **대표 이미지**(목록·추천·상세 헤더) | **TourAPI firstimage** (place.image_url) | ✅ |
| 인증사진 피드(다른 여행자) | 사용자 인증(기존 certification, PUBLIC·ACCEPTED) | ✅ 재사용 |
| 도감 썸네일 | 사용자 본인 최신 인증사진 | 기존(dogam) |
| visitStatus | 현재 유저(visit 존재) | ✅ |
| rating/ratingCount | 사용자 평점 집계 | 후속(null/0) |

## 데이터 모델

`place` 테이블에 컬럼 1개 추가 (새 마이그레이션, drizzle-kit generate → 0014):
```sql
ALTER TABLE place ADD COLUMN image_url text;   -- nullable, TourAPI firstimage URL
```
- Drizzle `places.ts`: `imageUrl: text('image_url')` (nullable).
- 새 테이블 없음. StoragePort 미사용(외부 URL 문자열).

## 시드 확장 — `src/db/seeds/seed-places.ts`

`areaBasedList2` 항목에서 이미지 캡처(재실행 시 기존 place 백필):
- `PlaceItem`에 `image: string | null` 추가.
- 파싱: `image: (i.firstimage2 && String(i.firstimage2).trim()) || (i.firstimage && String(i.firstimage).trim()) || null`
  (firstimage2=썸네일 우선, 없으면 firstimage 원본, 둘 다 없으면 null).
- `upsertPlaceKo`: `insert().values({... imageUrl: p.image})` + `onConflictDoUpdate({ set: {... imageUrl: p.image }})`.
- `arrange: 'A'` 유지(전수). 이미지 없는 관광지는 image_url null.
- EN/JA/ZH 경로는 place row를 안 만들므로 이미지 미변경(KO 경로에서만 적재).

## API

성공은 `{result:...}`만. `@ApiOperation` summary. imageUrl은 전부 TourAPI 절대 URL 또는 null.

### `GET /api/places/:id` 확장 (OptionalJwt)
```jsonc
{ "result": {
  "id":"uuid", "name":"속초 영금정", "address":"속초시 영금정로 43", "regionCode":"32_1",
  "imageUrl":"http://tong.visitkorea.or.kr/cms/resource/....jpg",
  "tags":["동해바다","정자"], "rarityWeight":1.0,
  "rating": null, "ratingCount": 0,
  "mission":"...", "description":"푸른 동해 바다와 절경을 함께 즐길 수 있는 전망 명소!",
  "visitStatus":"NONE",
  "lat":38.2, "lng":128.6
}}
```
- 기존 `PlaceView` 필드 유지 + 추가: `imageUrl`(place.image_url), `rating:null`, `ratingCount:0`, `visitStatus`.
- `getPlace(id, locale, userId?)` — OptionalJwt로 userId 주입. visitStatus = `userId && visit(userId,placeId) 존재` → `VISITED`, 아니면(게스트 포함) `NONE`.
- place 부재/HIDDEN → 404(기존과 동일). placeId UUID 검증.

### `GET /api/places/:id/certifications?cursor=&limit=8` (공개) — 다른 여행자 인증사진 피드
```jsonc
{ "result": {
  "items":[ {"imageUrl":"/api/certifications/photos/certifications/x.jpg","userHandle":"@a","createdAt":"..."} ],
  "nextCursor":"..."
}}
```
- **PUBLIC + ACCEPTED** certification만, `created_at DESC, id DESC` 커서. users.handle 조인.
- imageUrl = `/api/certifications/photos/{image_key}` (기존 서빙 라우트가 PUBLIC은 게스트 허용 — 확인됨).
- limit 기본 8·max 50. 없으면 `{items:[], nextCursor:null}`. place 존재 여부 검증 안 함(없으면 빈 목록).

### imageUrl 실데이터 반영 (기존 null → place.image_url)
- `GET /regions/:code/places` items[].imageUrl (regions.service.ts:103)
- `GET /regions/:code/recommended` [].imageUrl (regions.service.ts:130)
- `GET /discovery/today` [].imageUrl (home.service.ts:70)
- 각 repository의 place 조회 SELECT에 `image_url` 추가 → 서비스가 매핑.

## 아키텍처

### places 모듈
- **`places.ts`(schema)**: image_url 컬럼.
- **`places.repository.ts`**: `nearbyPlaces`/기타 place 조회에 image_url select 추가. `getPlace`용 조회가
  image_url 포함하도록. visit 존재 확인용 헬퍼(또는 서비스에서 visits 조회).
- **`places.service.ts`**: `PlaceView`에 `imageUrl/rating/ratingCount/visitStatus` 추가. `getPlace` 시그니처에
  `userId?` 추가(visitStatus 판정). `createPlace` cmd에 `imageUrl?` 추가(어드민 TourAPI 등록 시 전달, 사용자 제출은 null).
- **인증 피드**: `CertificationsService.publicFeedForPlace(placeId, cursor?, limit)` 신규.
  라우트는 places.controller에 둠 → **PlacesModule이 CertificationsModule import**
  (CertificationsModule은 CertificationsService export 확인됨 — certifications.module.ts:27).
- **places.controller**: `GET :id`에 OptionalJwtAuthGuard + `@CurrentUser`(optional). `GET :id/certifications` 공개 라우트.
  ⚠️ 라우트 순서: `:id/certifications`가 `:id`보다 뒤여도 무방(경로 세그먼트 다름)하나, 정적 라우트 있으면 앞에.

### regions/home 모듈
- **regions.repository / home.repository**: place 조회 SELECT에 image_url 추가.
- **regions.service.ts / home.service.ts**: `imageUrl: null` → `imageUrl: r.imageUrl ?? null`. 타입 `imageUrl: string | null`.

### 인증 피드 repository
- **certifications.repository.ts**: `publicFeedForPlace(placeId, cursorCreatedAt?, cursorId?, limit)` —
  `status='ACCEPTED' AND visibility='PUBLIC' AND place_id=:id`, users 조인(handle), `created_at DESC, id DESC`, limit+1로 nextCursor.
  `@platform/pagination/cursor`의 encodeCursor/decodeCursor/buildCursorPage 재사용.

## 테스트

- **PlacesService.getPlace 확장 단위**(repo 모킹): imageUrl 매핑(값/null), visitStatus(userId+visit→VISITED / 게스트·미방문→NONE), rating null·ratingCount 0, place 부재 404.
- **CertificationsService.publicFeedForPlace 단위**(repo 모킹): PUBLIC+ACCEPTED 매핑(imageUrl·handle·createdAt), nextCursor 생성, 빈 목록, limit 범위.
- **regions.service 기존 spec 갱신**: `imageUrl: null` 기대 → 실제 URL 매핑(repo 모킹이 image_url 반환)으로 수정.
- **home.service 기존 spec 갱신**: discovery imageUrl 매핑.
- 시드 image_url 적재, 인증 서빙 게스트 접근, imageUrl 절대 URL 렌더는 수동/빌드 검증.

## 비범위 (후속)

- 이미지 재호스팅(핫링크→우리 스토리지), 상세 갤러리(detailImage2 다중), place_rating(평점 제출·집계),
  PLANNED(찜/bookmark), 인증 피드 인기순, 사용자 제출 place 이미지 폴백(본인 인증사진), TourAPI 이미지 만료 대응.
