# 한땀 — 화면별 API 명세 (Figma 대조)

> Figma 12개 화면을 기준으로 **각 화면이 호출하는 API / 쿼리 / 응답 필드**를 매핑.
> ✅ = 구현됨, 📐 = 설계/예정. 공통: 인증 필요한 API는 `Authorization: Bearer <accessToken>`,
> 다국어는 `Accept-Language`(KO/EN/JA/ZH, 미들웨어가 RequestContext.locale로 처리).
> 모든 콘텐츠 텍스트(지역명/여행지명 등)는 locale에 맞는 `_trans` 행을 골라 응답.

---

## 0. 로그인 화면  📐(kakao ✅ / google 교체필요)
요소: "카카오로 계속하기", "Google로 계속하기", 하단 약관 동의 문구.

| API | 설명 | body → 응답 |
|---|---|---|
| `POST /api/auth/oauth/kakao` ✅ | 카카오 로그인 | `{accessToken}` → `{user, tokens}` |
| `POST /api/auth/oauth/google` 📐 | 구글 로그인 (네이버→구글 교체) | `{idToken}` → `{user, tokens}` |
| `GET /api/agreements/current?type=TOS` 📐 | 로딩/가입 시 약관 | → `{version, title, body}` (locale별) |
| `POST /api/me/agreements` 📐 | 동의 기록 | `{agreementId}` → 204 |

---

## 1. 홈 / 전체 지도 (지도 탭)  📐
요소: 총 여행 점수 **315점**, 전국 **127위**, 전체 진행도 **63%(102/161)**, 시·도별 % (서울·경기 80%…), 오늘의 추천 여행지 3개, 인증하기 FAB.

| API | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /api/me/summary` | - | `{score, nationalRank, totalUsers, progress:{percent, collected, total}}` → 상단 점수/순위/진행도 |
| `GET /api/me/progress/sido` | - | `[{sidoCode, name, percent, collected, total}]` → 시·도별 색칠/% |
| `GET /api/discovery/today` | `?limit=3` | `[{placeId, name, address, imageUrl}]` → 오늘의 추천 여행지 |

(인증하기 FAB → 인증 플로우 6번)

---

## 2. 도 상세 (강원도)  📐
요소: 진행도 **70%**, 수집현황 **15/21곳**, "6곳 더", 다음 추천(속초 영금정·방문예정), 여행지 목록 + filter 전체(21)/방문완료(15)/방문예정(6).

| API | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /api/regions/:sidoCode` | - | `{name, description, progress:{percent, collected, total, remaining}}` → 도 헤더/진행도 |
| `GET /api/regions/:sidoCode/places` | `?status=ALL\|VISITED\|PLANNED&page=&limit=` | `{items:[{placeId, name, address, imageUrl, visitStatus}], counts:{all, visited, planned}, total}` → 목록 + filter 카운트 |
| `GET /api/regions/:sidoCode/recommended` | `?limit=1` | `[{placeId, name, address, imageUrl}]` → 다음 추천 여행지 |

- `visitStatus`: `VISITED`(방문완료=인증됨) / `PLANNED`(방문예정=찜) / `NONE`
- `:sidoCode` = 시·도 코드(예: `32` 강원). 목록은 그 시·도 산하 시·군·구의 여행지.

---

## 3. 여행지 상세 (속초 영금정)  📐

### `GET /api/places/:placeId`  → place 고유 정보 (점수는 scoring 도메인에서)
```jsonc
{
  "id": "uuid",
  "name": "속초 영금정",                 // ← 지명(헤더)            place_trans.name (locale)
  "address": "강원도 속초시 영금정로 43",  // ← 주소                  place_trans.address
  "images": ["https://cdn/.../1.jpg"],   // ← 상단 이미지            place_image
  "tags": ["동해바다","전망명소","일출명소","정자"], // ← #태그       place_tag
  "rarityWeight": 1.0,                   // ← 목적지 희소도(place 본연 속성)  place.rarity_weight
  "rating": 4.8,                         // ← 여행자 평점 4.8       AVG(place_rating.score)
  "ratingCount": 123,                    //                        COUNT(place_rating)
  "mission": "영금정 정자와 동해 바다가 함께 보이는 사진을 인증해주세요!", // ← 여행 인증 미션  place_trans.mission
  "visitStatus": "NONE"                  // ← 미방문/방문완료/방문예정 (현재 유저 기준)
}
```
> 점수/지역가중치는 place의 정적 필드가 아니라 **scoring 정책에서 계산** → 아래 `scoring` 엔드포인트.

### 점수 (scoring 도메인) — ★별·가중치는 여기
| API | 응답 → 화면 |
|---|---|
| `GET /api/scoring/places/:placeId` | `{action:"CERT_PHOTO", basePoints:15, regionWeight:1.5, rarityWeight:1.0, eventMultiplier:1.0, estimatedPoints:22.5}` → **획득 별 15 · 지역 가중치 ×1.5** |

- **estimatedPoints = basePoints × regionWeight × rarityWeight × eventMultiplier** (시즌/이벤트 multiplier 포함, 시점에 따라 변동).
- 계산은 **ScoringService** 한 곳 → 미리보기(이 엔드포인트)와 인증 실제 적립(score_event)이 동일 값(SSOT).
- 입력: score_rule(action base), region_weight, place.rarity_weight, score_multiplier(EVENT/SEASON).

### 나머지 (별도 호출 — 모양이 달라 분리)
| API | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /api/places/:placeId/compositions` | `?locale=` | `[{seq, title, description, exampleImageUrl, source}]` → **구도 추천**(① 정자+동해바다 ② 정자+바위+파도) |
| `GET /api/places/:placeId/certifications` | `?cursor=&limit=8` | `{items:[{imageUrl, userHandle}], nextCursor}` → **다른 여행자 인증 사진**(공개분, cursor) |

> 의존 모델: `place`(base_points·rarity_weight·tags), `place_trans`(name·address·mission), `place_rating`(평점 집계), `place_composition(+trans)`(구도), `region_weight`(지역 가중치).

---

## 4–6. 인증 플로우  📐
**4) 카메라(영금정 인증)** — 참고 구도 표시(3번 compositions 재사용).

| API | 설명 |
|---|---|
| `POST /api/certifications/photos/presigned` | S3 업로드 URL 발급 → `{uploadUrl, imageKey}` (클라가 직접 PUT) |

**5) 방문 인증하기(제출)** — 위치확인 ✓, 구도확인 ✓, 한 줄 기록, 공개설정, 점수 미리보기.

| API | body | 응답 → 화면 |
|---|---|---|
| `POST /api/certifications` (header `Idempotency-Key`) | `{placeId, imageKey, deviceLat, deviceLng, capturedAt, caption?, visibility:PRIVATE\|PUBLIC}` | `{certId, status, proximityPass, regionResolved, compositionMatch}` |

- 동기 검증: `proximityPass`(GPS↔장소), `compositionMatch`(추천 구도 일치, AI 보조)
- 비동기: 랜드마크 검증/모더레이션은 이후 상태 갱신

**6) 인증 완료** — `POST /api/certifications` 응답(또는 `GET /api/certifications/:id`)에 점수/도감/도진행도 포함:
```
{ awardedPoints, expAwarded,
  region: { sidoCode, beforePercent:70, afterPercent:74, collected:104, total:140 },
  dogam: { collectedPlaceId } }
```
→ "70%→74%", "+15(×1.5 적용)", "도감에 수집".

---

## 7. 여행 도감 (도감 탭)  📐
요소: 지역별/테마별/최근수집 탭, 전국 수집현황 **63%(102/161)**, 시·도 카드 %+N/M + 잠금(세종 🔒).

| API | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /api/me/dogam/overview` | - | `{percent, collected, total}` → 전국 수집현황 |
| `GET /api/me/dogam/regions` | - | `[{sidoCode, name, percent, collected, total, locked}]` → 지역별 탭 카드 |
| `GET /api/me/dogam/themes` | `?cursor=&limit=` | `{items:[{collectionId, title, filled, total, thumbnails[]}], nextCursor}` → 테마별 탭 (cursor) |
| `GET /api/me/dogam/recent` | `?cursor=&limit=` | `{items:[{placeId, name, imageUrl, collectedAt}], nextCursor}` → 최근 수집 탭 (cursor) |

- `locked`: 해금 전 지역(세종 등). 해금 조건은 정책(추후).

---

## 8. 마이페이지 (마이 탭)  📐
요소: Lv.**23**, EXP **2,450/3,200**, 도감 진행률 **63%**, 방문 장소 **102**, 전국 랭킹 **127위/15,284명**, [도감 진행률] 탭(컬렉션 N/M), [랭킹] 탭.

| API | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /api/me/profile` | - | `{handle, displayName, avatarUrl, level, exp, expForNextLevel, dogamPercent, visitedCount, nationalRank, totalUsers}` → 프로필 카드 |
| `GET /api/me/collections` | `?cursor=&limit=` | `{items:[{id, title, filled, total, thumbnails[]}], nextCursor}` → 도감 진행률 탭 (cursor) |
| `GET /api/rankings` | `?scope=NATIONAL&period=CUMULATIVE\|MONTHLY&cursor=` | `{topPercent, top3:[{rank, handle, score, badge}], leaderboard:{items:[{rank, handle, score, dogamPercent}], nextCursor}, me:{rank, score, dogamPercent, pointsToNext}}` → 랭킹 탭 (리더보드 cursor) |

- `period`: 전국 누적 / 이번 달
- top3 = 뱃지(여행마스터 등), `me.pointsToNext` = "다음 순위까지 18점"

---

## 공통 / 관리자 (구현됨)
| API | 상태 |
|---|---|
| `POST /api/auth/refresh`, `/logout`, `GET /api/auth/me` | ✅ |
| `GET /api/admin/members`, `/admins`, `PATCH .../status` 등 | ✅ |
| `GET /api/health` | ✅ |

---

## 이 명세가 의존하는 신규 모델 (요약)
- `place`(+`place_trans`): 여행지. **basePoints, rarityWeight, tags, rating 집계, sigungu/region 연결**
- `place_composition`(+`_trans`): 구도 추천 (title/desc/example image, source CURATED|AI)
- `certification`: imageKey, deviceGPS, caption, visibility, proximity/composition 결과
- `score_event`: 점수 원장 (base×regionWeight×rarityWeight, exp)
- `score_rule`, `region_weight`, `level_policy`, `user_stat`
- `user_place_bookmark`: 방문예정(찜)
- `region.is_locked` / 해금 조건
- `agreement`(+`_trans`), `user_agreement`
- 진행도: `user_region_progress`(시·군·구→시·도 집계), `user_collection_progress`

> ⚠️ 미해결: 소셜 provider(네이버→구글), `region_trans` 마이그레이션. 정리 후 위 엔드포인트를 모듈 단위로 구현.
