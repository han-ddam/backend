# 사용자 장소 추가 + EN 시드 준비 + Swagger summary — 설계 (2026-07-07)

## 사용자 확정 결정

| 항목 | 결정 |
|---|---|
| 사용자 장소 공개 정책 | **검수 후 공개** — PENDING_REVIEW로 생성, 어드민 승인 시 ACTIVE |
| 지역(시·군·구) 결정 | **최근접 기존 장소 상속** — boundary 데이터 없음(0/251), 기존 7,860개 장소 중 최근접의 region_code 상속 |
| EN 시드 | **코드 준비 + region 정적 EN 지금 시드** — place EN은 EngService2 활용신청 승인 후 실행 |
| Swagger | 전 엔드포인트 `@ApiOperation` summary — 이모지 없이 심플한 한 줄 |
| nextCursor | 현행 유지 (opaque cursor — 논의 종결) |
| 시드 증분 | 현행이 이미 요구 충족(contentId upsert, 사용자 장소 불간섭) — 변경 없음 |

## A. 사용자 장소 추가

### 스키마 변경 (마이그레이션 0011)
- `place_status` enum에 `PENDING_REVIEW` 추가.
- `place`에 `created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL` 추가
  (NULL = 어드민/시드 출처. 사용자 제출 장소만 값 보유).

### API 1 — `POST /api/me/places` (로그인 필수, JwtAuthGuard)

Request (zod):
```jsonc
{
  "name": "우리동네 벚꽃길",          // 1~100자
  "address": "서울 성동구 ...",       // 선택, ≤200자
  "lat": 37.547, "lng": 127.04,      // 필수, 한국 범위 검증(lat 33~39, lng 124~132)
  "description": "..."               // 선택, ≤500자
}
```

Response 201:
```jsonc
{ "result": { "placeId": "<uuid>", "status": "PENDING_REVIEW", "regionCode": "1_13" } }
```

동작:
1. 최근접 ACTIVE 장소를 좌표 거리로 조회(PostGIS `ST_DWithin`/`<->` KNN, 반경 **10km** 내) → 그 장소의 `region_code` 상속.
2. 10km 내 장소가 없으면 400 `{error:{code:'BAD_REQUEST', message:'지역을 판정할 수 없는 좌표입니다'}}` (바다/국외 방어).
3. `place` insert: status=PENDING_REVIEW, created_by=userId, base_points=0, rarity_weight=1.00, tourapi_content_id=NULL.
4. `place_trans` insert: locale=KO, name/address/description.
- rate limit/중복 방어는 후속(비범위). PENDING은 목록/점수/방문 API에 노출 안 됨(전부 ACTIVE 필터 — 기존 코드 그대로).

### API 2 — 어드민 검수 (admin places에 추가)
- `GET /api/admin/places?status=PENDING_REVIEW` — 기존 adminList에 status 쿼리 필터 추가 (기본: 전체).
- `PATCH /api/admin/places/:id/status` body `{ status: 'ACTIVE' | 'HIDDEN' }` — 승인/반려. SUPER_ADMIN/ADMIN 모두 가능(기존 admin places 가드 관례 따름).

## B. EN 시드 준비

1. **`seed-places.ts` locale 파라미터화**: env `TOURAPI_LOCALE`(기본 KO), `TOURAPI_AREABASED_URL`(기존).
   EN 실행 예: `TOURAPI_LOCALE=EN TOURAPI_AREABASED_URL=https://apis.data.go.kr/B551011/EngService2/areaBasedList2 node dist/db/seeds/seed-places.js`
   - **핵심**: locale≠KO일 때는 place 신규 생성 금지 — `tourapi_content_id`가 이미 존재하는 place에만 `place_trans` upsert (EN 행 추가). contentId 미존재분은 스킵+카운트 로그 (영문 전용 콘텐츠는 비범위).
   - ⚠️ EngService2의 contentId가 국문과 동일한지는 키 승인 후 확인 — 다르면 이 전략 재검토(스킵 카운트로 판별 가능).
2. **region 정적 EN 시드**: 시·도 17개 영문명(Seoul, Incheon, Daejeon, Daegu, Gwangju, Busan, Ulsan, Sejong, Gyeonggi-do, Gangwon-do, Chungcheongbuk-do, Chungcheongnam-do, Gyeongsangbuk-do, Gyeongsangnam-do, Jeonbuk-do, Jeollanam-do, Jeju)을 정적 상수로 `region_trans(locale='EN')` upsert — 별도 스크립트 `seed-region-names-en.ts`(신규, package.json `seed:regions:en`), TourAPI 불필요. (`seed-regions.ts` 파라미터화는 YAGNI로 생략 — region 다국어는 정적 시드로 충분. 시·군·구 EN은 후속.)

## C. Swagger `@ApiOperation` summary

전 컨트롤러 각 핸들러에 `@ApiOperation({ summary: '...' })` 추가. 원칙: **이모지 금지, 한 줄, 명사형 종결**. 기존 JSDoc 주석 내용을 다듬어 사용. 대상: auth(6), agreements(3), places(2), admin-places(2), regions(4), visits(1), scoring(1), admin auth/admins/members(11), health(1) — 전부.

예: `여행지 방문 기록 (멱등)`, `시·도 코드 목록`, `인증 점수 미리보기`, `카카오 로그인`.

## 테스트

- **A**: service 단위 — 최근접 상속 성공/10km 밖 400/PENDING 생성값. admin status 변경 서비스 케이스. (repo 모킹, KNN 쿼리는 build+정적 검증 — 기존 관례.)
- **B**: 시드는 수동 실행 검증(기존 관례, 단위테스트 없음). KO 재실행 회귀는 로컬 실행으로 확인.
- **C**: 빌드 + Swagger JSON 확인.

## 비범위 (후속)

사용자 장소 rate limit·중복 감지, 반려 사유 전달, 사용자 제출 이력 조회(`GET /me/places`), 시·군·구 정적 EN, place EN 실행(키 승인 후), boundary 적재, JA/ZH.
