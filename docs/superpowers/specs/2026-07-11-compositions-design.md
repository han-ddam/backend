# 구도 가이드(Compositions) — 설계 (2026-07-11)

## 목적

카메라 인증 화면의 "참고 구도" — 여행지별 촬영 구도 가이드(설명 + 예시 사진)를 큐레이터가
등록하고 앱이 조회. 사용자가 어떻게 찍을지 안내한다.

## 범위 결정 (사용자 확정)

| 항목 | 결정 | 후속(비범위) |
|---|---|---|
| 범위 | 공개 조회 + 어드민 CRUD | — |
| 데이터 출처 | **큐레이터 등록** | 인기 인증사진 자동 구도(인기 지표 기능 선행 필요) |
| 예시 이미지 | StoragePort 어드민 업로드 → image_key | S3 전환 |
| source | `CURATED\|AI` enum (어드민 지정, 기본 CURATED) | AI 자동 생성 |

## 데이터 모델 (마이그레이션 0013)

```sql
composition_source enum: CURATED | AI

place_composition
  id                uuid PK
  place_id          uuid NOT NULL FK place(id) ON DELETE CASCADE
  seq               integer NOT NULL          -- 표시 순서(place 내)
  source            composition_source NOT NULL DEFAULT 'CURATED'
  example_image_key text                       -- StoragePort 키(없으면 null)
  created_at        timestamptz NOT NULL DEFAULT now()
  INDEX(place_id)

place_composition_trans                        -- i18n (place_trans 패턴, KO 폴백)
  composition_id    uuid NOT NULL FK place_composition(id) ON DELETE CASCADE
  locale            locale NOT NULL
  title             text NOT NULL
  description       text
  PK(composition_id, locale)
```
- Drizzle: `src/db/schema/compositions.ts`, `index.ts` export.

## 스토리지 리팩터 (선행)

`StoragePort`/`LocalStorage`/`storage.port.ts`를 `src/modules/certifications/storage/` →
**`src/platform/storage/`**(공용 인프라)로 이동. `save`에 폴더 파라미터 추가:
```ts
save(buffer: Buffer, mime: string, folder?: string): Promise<{ key: string }>  // 기본 'certifications'
// 키: `${folder}/${id}.${ext}`
```
- 기본값 `'certifications'` → **인증 동작 불변**. compositions는 `folder='compositions'`.
- certifications의 import 경로만 `@platform/storage/...`로 갱신(로직 동일). STORAGE 토큰/LocalStorage 바인딩은 certifications.module + compositions에서 각각 등록(또는 platform @Global StorageModule로 공용 제공 — 구현 시 결정, 단일 LocalStorage 인스턴스 공유가 깔끔).
- LocalStorage.spec도 이동, folder 파라미터 케이스 추가.

## API

성공은 `{result:...}`만, 실패는 `{error:{code,message}}`만. `@ApiOperation` summary 포함.

### 공개 — `GET /api/places/:id/compositions`
```jsonc
{ "result": [
  { "seq":1, "title":"정자+동해바다", "description":"정자와 바다가 함께 보이게...",
    "exampleImageUrl":"/api/places/compositions/photos/compositions/xxx.jpg",
    "source":"CURATED" }
]}
```
- `seq` 오름차순. title/description = locale(place_composition_trans), KO 폴백(title 없으면 '', description 없으면 null).
- `exampleImageUrl` = example_image_key 있으면 `/api/places/compositions/photos/{key}`, 없으면 null.
- place 없음/HIDDEN이어도 compositions는 반환(구도는 place 상태와 독립)? → **place ACTIVE 아니면 404**(상세와 일관). placeId UUID 검증(400).
- 구도 없으면 `{result:[]}`.

### 공개 이미지 서빙 — `GET /api/places/compositions/photos/:key(*)`
- StoragePort.read로 스트리밍. **항상 공개**(구도 예시는 공개 자료 — visibility 없음).
- path-traversal allowlist: `compositions/<id>.<ext>`만 허용, 아니면 404.
- **라우트 순서**: `:id`(상세)·`:id/compositions`보다 충돌 없게 정적 경로 우선 배치.

### 어드민(ADMIN+) — `/admin/places` 컨트롤러 확장
- `POST /admin/places/:id/compositions/photos` (multipart `file`) → `{imageKey}` — 예시 이미지 업로드(MIME jpeg/png/webp, ≤10MB, folder='compositions').
- `POST /admin/places/:id/compositions` (JSON) → 생성
  ```jsonc
  { "seq":1, "source":"CURATED", "imageKey":"compositions/xxx.jpg",  // imageKey 선택
    "translations":[ {"locale":"KO","title":"정자+동해바다","description":"..."} ] }  // KO 필수
  ```
  → `{ result: { compositionId } }`. place ACTIVE 확인(없으면 404), KO 번역 필수(없으면 400).
- `GET /admin/places/:id/compositions` → 그 place 구도 목록(전 locale 번역 포함, seq순).
- `DELETE /admin/places/compositions/:compositionId` → 삭제(cascade). 없으면 404.

## 아키텍처 — `places` 모듈 확장

장소 종속 데이터 + admin-places 패턴 재사용. 신규 모듈 안 만듦.
- **`compositions.repository.ts`**(places 모듈 내): 구도 CRUD, 번역 join, place ACTIVE 확인.
- **`places.service.ts`** 또는 신규 **`compositions.service.ts`**: 조회(seq순·locale 병합·imageUrl 조립), 어드민 생성(트랜잭션: composition+trans)/목록/삭제, 업로드(StoragePort).
  - 파일 비대 방지 위해 **`compositions.service.ts` 신규**(places.service와 분리) 권장.
- **컨트롤러**: 공개 조회+서빙은 `places.controller`(또는 신규 `compositions.controller`), 어드민은 `admin-places.controller` 확장. StoragePort는 platform에서 주입.
- **places.module**: compositions repo/service + StorageModule(platform) 배선.

## 테스트

- **service 단위**(repo/storage 모킹):
  - 조회: seq순 매핑, locale/KO 폴백, imageUrl 있음/null, place 부재→404, 빈 목록.
  - 어드민 생성: KO 필수 검증, source 기본 CURATED, imageKey optional, place 부재→404.
  - 삭제: 없음→404.
  - 업로드: StoragePort.save(folder='compositions') 호출.
- **LocalStorage 단위**: folder 파라미터(기본 certifications, compositions 지정) 키 생성.
- 이미지 서빙 path-traversal·멀티파트는 수동 e2e(기존 관례).

## 비범위 (후속)

인기 인증사진 자동 구도(인기 지표 수집 선행), 구도별 정렬/재정렬 UI, AI 구도 자동 생성,
S3 전환, 구도 수정(PATCH — MVP는 삭제 후 재등록), 인증 시 구도 일치도(compositionMatch) 채점.
