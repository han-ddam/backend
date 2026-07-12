# 컬렉션/테마 (화면7 테마별 + 화면8 도감 진행률) — 설계 (2026-07-12)

## 목적

어드민이 큐레이션하는 **테마 컬렉션**(예: "동해 명소", "등대 순례")을 도입한다.
사용자는 도감의 테마별 탭에서 테마 진행률을, 마이페이지에서 **지역별+테마별 모든 진행률**을 본다.
테마를 누르면 그 안의 장소 목록(수집 여부 포함)을 본다.

## 핵심 결정 (사용자 확정)

1. **테마 = 컬렉션, 하나의 개념·두 화면.** 화면7 테마별 탭과 화면8 도감 진행률 탭은 같은 컬렉션 데이터를 다른 뷰로 노출.
2. **테마는 별도 모델**(`collection`/`collection_place`/`collection_trans`) — place의 태그/카테고리가 아님. `place.tags`(자유 서술어)는 그대로 유지, place 스키마 미변경.
3. **`/me/collections` = 지역별 + 테마별 합본.** 지역은 별도 컬렉션 행으로 만들지 않고 기존 `region_code`로 계산(dogam 재사용) → **합성(compose)**. 각 항목에 `kind:'REGION'|'THEME'`.
4. **진행률 "collected = visit"** (dogam과 동일). filled = 소속 장소 중 방문한 수, total = 소속 장소 수.
5. **썸네일 = 소속 place의 `image_url`**(TourAPI 이미지 재사용). 커버 이미지·업로드 없음.
6. **테마 상세 = 전용 엔드포인트** `GET /collections/:id`, 기존 `/regions/:code/places` 패턴 재사용.
7. **`/me/collections`는 단일 병합 커서**(지역·테마 균일 페이지네이션). `/me/dogam/themes`는 테마만.

## 데이터 모델 (마이그레이션 0015)

```sql
-- 테마 엔티티
collection
  id          uuid PK
  seq         integer NOT NULL              -- 표시 순서(어드민)
  status      collection_status NOT NULL DEFAULT 'ACTIVE'   -- enum ACTIVE|HIDDEN
  created_at  timestamptz NOT NULL DEFAULT now()
  updated_at  timestamptz NOT NULL DEFAULT now()

-- i18n (KO 폴백) — place_trans/composition_trans와 동형
collection_trans
  collection_id uuid NOT NULL FK→collection ON DELETE CASCADE
  locale        locale NOT NULL
  title         text NOT NULL
  description   text
  PK(collection_id, locale)

-- 테마 소속 장소 (다대다)
collection_place
  collection_id uuid NOT NULL FK→collection ON DELETE CASCADE
  place_id      uuid NOT NULL FK→place ON DELETE CASCADE
  seq           integer NOT NULL             -- 테마 내 장소 순서
  PK(collection_id, place_id)
  INDEX(place_id)
```
- Drizzle: `src/db/schema/collections.ts`, `collectionStatusEnum` in enums.ts, index.ts export.

## 진행률·썸네일 (계산, 별도 집계 테이블 없음)

- `total` = `count(collection_place WHERE collection_id=:id)`
- `filled` = 그중 방문한 수 = `count(collection_place cp JOIN visit v ON v.place_id=cp.place_id AND v.user_id=:me WHERE cp.collection_id=:id)`
- `thumbnails[]` = 소속 place의 `image_url` 앞 **4개**(collection_place.seq ASC, `image_url IS NOT NULL`만). place 상세 확장에서 만든 `place.image_url` 재사용.
- 지역 항목(`/me/collections`)의 filled/total = 기존 `DogamService.regions`(collected/total), 썸네일 = 해당 region_code place `image_url` 앞 4개.

## API

성공은 `{result:...}`만. `@ApiOperation` summary. 로그인 필요 표기.

### `GET /api/me/dogam/themes?cursor=&limit=` (Jwt) — 도감 테마별 탭
```jsonc
{ "result": {
  "items": [ { "collectionId":"uuid", "title":"동해 명소", "filled":3, "total":8,
               "thumbnails":["http://tong/...jpg","http://tong/...jpg"] } ],
  "nextCursor": "..."
}}
```
- ACTIVE collection만, `seq ASC, id ASC` 키셋. 커서 = base64(`"<seq>|<id>"`). limit 기본 20·max 100.
- title = collection_trans(locale, KO 폴백). filled/total/thumbnails = 위 정의.

### `GET /api/me/collections?cursor=&limit=` (Jwt) — 마이페이지 도감 진행률 탭 (지역+테마 합본)
```jsonc
{ "result": {
  "items": [
    { "kind":"REGION", "id":"32", "title":"강원도", "filled":15, "total":21, "thumbnails":[...] },
    { "kind":"THEME",  "id":"uuid", "title":"동해 명소", "filled":3, "total":8, "thumbnails":[...] }
  ],
  "nextCursor": "..."
}}
```
- **병합 순서**: 지역(code 숫자 오름차순, 17개) → 테마(seq ASC, id ASC).
- **단일 병합 커서**:
  - 값: 마지막 항목이 지역이면 `R|<code>`, 테마면 `T|<seq>|<id>` (base64).
  - cursor 없음/`R|code`: 그 다음 지역부터 limit 채움. 지역 소진 후 남으면 테마 앞부분으로 이어짐(경계 넘김).
  - `T|seq|id`: 테마만 keyset으로 이어감(지역은 이미 통과 → 지역 계산 생략).
  - nextCursor = 마지막 항목 마커(뒤에 더 있으면), 없으면 null.
- 지역 항목: `DogamService.regions(userId, locale)`(17개, code순) 매핑 — id=sidoCode, title=지역명, filled=collected, total=total, thumbnails=region place image_url 앞 4개. `locked`는 이 화면에서 미노출.
- limit 기본 20·max 100.

### `GET /api/collections/:id?cursor=&limit=` (OptionalJwt) — 테마 상세(장소 목록)
```jsonc
{ "result": {
  "id":"uuid", "title":"동해 명소", "description":"...",
  "counts": { "all":8, "visited":3 },
  "items": [ { "placeId":"uuid", "name":"영금정", "address":"...", "imageUrl":"http://tong/...jpg",
               "visitStatus":"VISITED" } ],
  "nextCursor": "..."
}}
```
- ACTIVE collection만(HIDDEN/없음 → 404). placeId UUID 검증(`:id`).
- items = 소속 place, `collection_place.seq ASC, place_id ASC` 키셋 커서(`"<seq>|<id>"`). name/address = place_trans(locale, KO 폴백). imageUrl = `place.image_url`. visitStatus = 로그인+visit → VISITED, 아니면 NONE(Task 2 패턴).
- counts.all = total, counts.visited = filled(로그인 시, 게스트 0). limit 기본 20·max 100.

### 어드민 (ADMIN+, AdminJwtGuard+AdminRolesGuard) — compositions/places 어드민 패턴
- `POST /api/admin/collections` `{seq, status?, translations:[{locale,title,description?}]}`(KO 필수) → `{collectionId}`
- `GET /api/admin/collections?page=&limit=` → `{items:[{id,seq,status,title,total}], total, page, limit}` HIDDEN 포함(seq순). **관리자 게시판형이라 offset/page**(기존 `PlacesService.adminList` 패턴). user-facing 목록은 전부 커서, 어드민 관리 목록만 offset — [[handdam-pagination-convention]].
- `PATCH /api/admin/collections/:id` `{seq?, status?}` → 갱신(없으면 404)
- `DELETE /api/admin/collections/:id` → 삭제(CASCADE로 trans·place 정리)
- `POST /api/admin/collections/:id/places` `{placeId, seq}` → 소속 추가(collection·place 존재 확인, 중복 시 409/멱등). place ACTIVE 확인.
- `DELETE /api/admin/collections/:id/places/:placeId` → 소속 제거(없으면 404)

## 아키텍처 — 신규 `src/modules/collections/`

- **`collections.repository.ts`**: collection CRUD, collection_trans, collection_place CRUD, 진행률 집계(themesProgress: 페이지 테마들의 total/filled 배치), 썸네일 배치(collection별·region_code별 image_url 앞 4개), 상세 place 목록 키셋, 테마 keyset 목록.
- **`collections.service.ts`**:
  - `listThemesWithProgress(userId, locale, cursor?, limit)` → 테마 카드 페이지.
  - `listMyCollections(userId, locale, cursor?, limit)` → 지역(DogamService.regions 매핑)+테마 병합 커서.
  - `getCollectionDetail(id, locale, userId?, cursor?, limit)` → 테마 상세(장소 목록).
  - 어드민: create/list/update/delete/addPlace/removePlace.
- **`collections.controller.ts`**(공개): `GET /collections/:id`.
- **`me-collections.controller.ts`**(Jwt): `GET /me/collections` **및 `GET /me/dogam/themes`** — 둘 다 collections 모듈이 소유. `/me/dogam/themes`는 URL만 dogam 경로일 뿐 데이터는 컬렉션이라 여기서 서빙(DogamController에 두지 않음).
- **`admin-collections.controller.ts`**(Admin): 위 어드민 목록/6종.
- **모듈 의존은 단방향**: **CollectionsModule imports DogamModule**(지역 카드용 `DogamService.regions`) + AuthModule + AdminModule. DogamModule은 Collections를 import하지 않음 → **순환 없음**(테마 라우트를 dogam이 아닌 collections에 두었기 때문).
- 커서 헬퍼: 테마·상세는 `seq|id` 전용 인코딩(collections 모듈 자체), 병합은 `R|code`/`T|seq|id`. 기존 `@platform/pagination/cursor`(createdAt+id)는 형식이 달라 재사용 안 함 — 소규모 전용 헬퍼 추가.

## 테스트

- **CollectionsService.listThemesWithProgress 단위**(repo 모킹): 카드 매핑(title/filled/total/thumbnails), 커서 nextCursor, 빈 목록, 게스트 없음(Jwt 필수).
- **listMyCollections 단위**: 병합 순서(지역 후 테마), kind 부여, 지역 매핑(DogamService.regions 모킹), 경계 넘김(지역 끝→테마 시작 같은 페이지), `T|` 커서 시 지역 스킵, nextCursor 마커 형식.
- **getCollectionDetail 단위**: 장소 매핑(imageUrl/visitStatus/name), counts(all/visited), 404(HIDDEN/없음), 게스트 visitStatus NONE.
- **어드민 단위**: create(KO 필수 400), addPlace(place ACTIVE 확인·중복), removePlace(404), update(404), delete.
- 마이그레이션·병합 커서 SQL·멀티 locale은 빌드+정적검증+수동 e2e.

## 비범위 (후속)

- `user_collection_progress` 집계 테이블(성능 최적화 — 지금은 실시간 계산), 테마 커버 이미지, 테마 잠금(locked)·해금 조건, 테마 추천/개인화, 컬렉션 좋아요/공유, 지역 항목 상세를 collections에서 재서빙(지역은 기존 `/regions/:code/places` 사용).
