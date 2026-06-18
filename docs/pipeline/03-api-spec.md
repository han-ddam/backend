# 한땀 — 화면별 API / DTO 명세 (개발 기준)

> 이 문서는 Figma 화면 ↔ API ↔ 요청/응답 DTO를 1:1로 정리한 **개발 기준 명세**다.
> `docs/dto/*.svg` 카드(화면별)와 동일 내용을 텍스트로 담았으며, 두 문서가 어긋나면 **이 문서가 기준**.
> 초기 `docs/api-spec.md`는 용어 드리프트(sido/naver 등)가 있어 폐기 대상 — 본 문서로 대체한다.
>
> 범례: ✅ 구현됨 · 📐 설계(예정) · ♻️ 신규 API 없음(기존 재사용/응답 렌더)

---

## 0. 공통 규약

| 항목 | 규칙 |
|---|---|
| **Base URL** | 모든 경로 앞에 글로벌 프리픽스 `/api` (문서에선 생략). |
| **인증** | 보호 API는 `Authorization: Bearer <accessToken>`. 액세스 토큰 만료 시 `POST /auth/refresh`로 재발급. |
| **다국어** | `Accept-Language: ko|en|ja|zh` → 미들웨어가 `RequestContext.locale`로 변환. 콘텐츠 텍스트(지역명·여행지명·약관 등)는 locale에 맞는 `_trans` 행을 골라 응답하고, 없으면 **KO로 폴백**. |
| **페이지네이션 — 앱 피드** | **커서(keyset)**. `?cursor=<opaque>&limit=N` → `{ items, nextCursor }`. `nextCursor=null`이면 끝. 커서는 `(createdAt,id)`의 base64url. |
| **페이지네이션 — 관리자 목록** | **오프셋**. `?page=1&limit=N&q=` → `{ items, total, page, limit }`. |
| **멱등성** | 점수·EXP·도감을 변경하는 `POST /certifications`는 헤더 `Idempotency-Key: <uuid>` 필수(§6 참고). |
| **에러 포맷** | `{ statusCode, message, error }` (Nest 기본). 검증 실패 422(zod), 인증 401, 권한 403, 충돌 409. |
| **시간** | 모든 timestamp는 ISO-8601 UTC. |

### 공통 타입
```
tokens        = { accessToken, refreshToken }
user          = { id, handle, displayName }
member        = { id, handle, displayName, email, status, createdAt }
admin         = { id, email, name, role(SUPER_ADMIN|ADMIN), isActive, createdAt }
placeDetail   = { id, regionCode, name, address, description, mission, tags[], rarityWeight, rating, ratingCount, visitStatus, images[] }
placeListItem = { id, name, address, tags[] }
CreatePlaceDto= { regionCode, tourapiContentId?, lat?, lng?, basePoints, rarityWeight, tags?,
                  translations[{ locale, name, address?, description?, mission? }] }
paged<T>      = { items:[T], total, page, limit }   // offset · 관리자
cursor<T>     = { items:[T], nextCursor }           // keyset · 앱 피드
```

---

## 앱 화면별 명세

### 0. 로그인  📐 (kakao ✅ / naver ✅ / google ✅)
카드: `dto-login.svg`

| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| `POST /auth/oauth/{kakao\|naver\|google}` | `{ accessToken }` (모바일 SDK가 받은 provider 토큰) | `{ user{id,handle,displayName}, tokens{accessToken,refreshToken} }` |
| `GET /agreements/current?type=TOS\|PRIVACY` | - | `{ id, type, title, body }` (locale별) |
| `POST /me/agreements` | `{ agreementId }` | `204` |

> 백엔드가 provider 토큰을 검증(token-handoff) → 최초면 회원 생성, 기존이면 로그인. SUSPENDED 회원은 거부.

---

### 1. 앱 진입 / 지도 로딩 (스플래시)  ♻️
카드: `dto-splash.svg` — **신규 API 없음**. 홈/전체지도 데이터를 미리 로드하는 로딩 상태 화면.
- `GET /me/summary` (63% · 102/161)
- `GET /me/progress/provinces` (지역별 핀 카운트)

---

### 2. 홈 / 전체 지도 (지도 탭)  📐
카드: `dto-home-map.svg`

| 메서드 · 경로 | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /me/summary` | - | `{ score, nationalRank, totalUsers, progress{percent,collected,total} }` → 상단 점수·순위·진행도 |
| `GET /me/progress/provinces` | - | `[ { provinceCode, name, percent, collected, total } ]` → 시·도별 색칠/% |
| `GET /discovery/today` | `?limit=3` | `[ { placeId, name, address, imageUrl } ]` → 오늘의 추천 |

> **`/me/summary`는 "내 현황" 단일 출처**다. 도감 탭 헤더·마이페이지 헤더도 같은 progress 값을 재사용해 숫자 불일치를 방지한다(계산 원천 = `user_stat`). 인증하기 FAB → §6 인증 플로우.

---

### 3. 도 상세 (예: 강원도)  📐
카드: `dto-region-detail.svg`

| 메서드 · 경로 | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /regions/:code` | - | `{ code, name, description, progress{percent,collected,total,remaining} }` → 도 헤더/진행도 |
| `GET /regions/:code/places` | `?status=ALL\|VISITED\|PLANNED&cursor=&limit=` | `{ items[{placeId,name,address,imageUrl,visitStatus}], counts{all,visited,planned}, nextCursor }` → 필터 탭 + 목록 |
| `GET /regions/:code/recommended` | `?limit=1` | `[ { placeId, name, address, imageUrl } ]` → 다음 추천 |

---

### 4. 여행지 상세 (예: 속초 영금정)  📐 (placeDetail ✅ 일부)
카드: `dto-place-detail.svg`

| 메서드 · 경로 | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /places/:id` | - | `placeDetail` → 별·태그·미션·평점·사진 |
| `GET /scoring/places/:id` | - | `{ action, basePoints, regionWeight, rarityWeight, eventMultiplier, estimatedPoints }` → 별 가중치/예상 점수 |
| `GET /places/:id/compositions` | - | `[ { seq, title, description, exampleImageUrl, source } ]` → 구도 추천 |
| `GET /places/:id/certifications` | `?cursor=&limit=8` | `{ items[{imageUrl,userHandle}], nextCursor }` → 타인 인증샷 |

> **점수는 place에 박지 않고 `/scoring/places/:id`로 분리**한다(룰/가중치/이벤트 배수가 데이터 기반으로 바뀌므로). 현재 `GET /places/:id`·`/places`(목록)는 ✅ 구현, scoring/compositions/certifications는 📐.

---

### 5. 카메라 촬영 (예: 영금정 인증)  ♻️
카드: `dto-camera.svg` — **신규 API 없음**.
- `GET /places/:id/compositions` → 가이드 문구("정자와 바다가…")=`title/description`, 참고 구도 썸네일=`exampleImageUrl`.
- 촬영은 디바이스 로컬. 업로드(presigned)는 다음 인증하기 화면(§6).

---

### 6. 방문 인증하기 (작성·제출)  📐
카드: `dto-certify-submit.svg`

| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| `GET /scoring/places/:id` | - | `{ action, basePoints, regionWeight, rarityWeight, eventMultiplier, estimatedPoints }` → 예상 점수 +15 / ×1.5 |
| `POST /certifications/photos/presigned` | `{ contentType }` | `{ uploadUrl, imageKey }` (S3 직접 업로드) |
| `POST /certifications` (header `Idempotency-Key`) | `{ placeId, imageKey, deviceLat, deviceLng, capturedAt, caption?, visibility:PRIVATE\|PUBLIC }` | §7 응답 |

> **`Idempotency-Key`** = "인증 올리기" 탭 시 클라가 만든 UUID(재시도해도 동일). 점수·EXP·도감을 바꾸는 요청이라, 더블탭·자동 재시도·응답 유실로 같은 인증이 여러 번 처리되면 점수 중복 지급/도감 중복 등록됨 → 서버가 이 키로 "같은 시도"를 식별해 **처음 1번만 처리, 이후엔 저장된 결과를 반환(멱등, TTL 24h)**.
> 화면의 ✅위치 확인·✅구도 확인은 **클라 프리뷰**(place 좌표 + compositions). 최종 판정은 제출 응답의 `proximityPass`/`compositionMatch`.

---

### 7. 인증 완료  ♻️
카드: `dto-certify-result.svg` — **신규 호출 없음**. §6 `POST /certifications`의 응답을 렌더.
```
{ certId, status, proximityPass, compositionMatch,
  awardedPoints, expAwarded,
  region{ beforePercent, afterPercent, collected, total } }
```
> 70% → 74% = `region.before/afterPercent`, +15점 = `awardedPoints`.

---

### 8. 여행 도감 (도감 탭)  📐
카드: `dto-dogam.svg`

| 메서드 · 경로 | 쿼리 | 응답 → 화면 |
|---|---|---|
| (헤더 63%) | - | `GET /me/summary`의 `progress` 재사용 |
| `GET /me/dogam/regions` | - | `[ { provinceCode, name, percent, collected, total, locked } ]` → 지역별 |
| `GET /me/dogam/themes` | `?cursor=&limit=` | `{ items[{collectionId,title,filled,total,thumbnails[]}], nextCursor }` → 테마/컬렉션 |
| `GET /me/dogam/recent` | `?cursor=&limit=` | `{ items[{placeId,name,imageUrl,collectedAt}], nextCursor }` → 최근 수집 |

---

### 9. 마이페이지 — 헤더 + 도감 진행률 탭  📐
카드: `dto-mypage-progress.svg`

| 메서드 · 경로 | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /me/profile` | - | `{ handle, displayName, avatarUrl, level, exp, expForNextLevel, dogamPercent, visitedCount, nationalRank, totalUsers }` → 공통 헤더(Lv·EXP / 도감 63% · 방문 102 · 전국 127위) |
| `GET /me/collections` | `?cursor=&limit=` | `{ overall{collected,total}, items[{id,title,filled,total,thumbnails[]}], nextCursor }` → 전체 진행 현황 + 컬렉션 N/M |

> 헤더(프로필·3스탯)는 랭킹 탭과 공유.

---

### 10. 마이페이지 — 랭킹 탭  📐
카드: `dto-mypage-ranking.svg`

| 메서드 · 경로 | 쿼리 | 응답 → 화면 |
|---|---|---|
| `GET /rankings` | `?scope=NATIONAL&period=CUMULATIVE\|MONTHLY&cursor=` | `{ topPercent, top3[{rank,handle,score,badge,dogamPercent}], leaderboard{items[{rank,handle,score,dogamPercent}],nextCursor}, me{rank,score,dogamPercent,pointsToNext} }` |

> `topPercent`=전국 상위 1%, `top3`=1·2·3위 카드, `leaderboard`=순위 리스트, `me.pointsToNext`=다음 순위까지 18점.

---

### 11. 약관  📐
카드: `dto-agreement.svg`

| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| `GET /agreements/current?type=TOS\|PRIVACY\|CONTENT_LICENSE` | - | `{ id, type, version, title, body, required }` (locale별) |
| `POST /me/agreements` | `{ agreementId }` | `204` (→ `user_agreement` 기록) |
| `GET /me/agreements` | - | `[ { agreementId, type, version, acceptedAt } ]` 내 동의 이력 |

---

## 관리자 (Admin)  ✅ 구현됨
별도 도메인(자체 admin 테이블, `typ:'admin'` JWT, 전용 가드). 목록은 오프셋 페이지네이션.

### 인증
| 메서드 · 경로 | 요청 | 응답 |
|---|---|---|
| `POST /admin/auth/login` | `{ email, password }` | `{ admin, tokens }` |
| `POST /admin/auth/refresh` | `{ refreshToken }` | `tokens` |
| `POST /admin/auth/logout` | `{ refreshToken }` | `204` |
| `GET /admin/auth/me` | - | `{ adminId, role }` |

### 회원 / 관리자 관리 (가드: `SUPER_ADMIN`, `ADMIN`)
| 메서드 · 경로 | 쿼리/요청 | 응답 |
|---|---|---|
| `GET /admin/members` | `?page&limit&q` | `paged<member>` |
| `GET /admin/members/:id` | - | `member` |
| `PATCH /admin/members/:id/status` | `{ status: ACTIVE\|SUSPENDED }` | `member` |
| `GET /admin/admins` | `?page&limit&q` | `paged<admin>` |
| `GET /admin/admins/:id` | - | `admin` |
| `POST /admin/admins` | `{ email, password, name, role? }` | `admin` |
| `PATCH /admin/admins/:id` | `{ name?, role?, isActive? }` | `admin` |

### 여행지 관리
| 메서드 · 경로 | 쿼리/요청 | 응답 |
|---|---|---|
| `POST /admin/places` | `CreatePlaceDto` | `{ id, regionCode, basePoints, rarityWeight }` |
| `GET /admin/places` | `?province?&page&limit` | `paged<place>` |

---

## 구현 현황 요약

| 도메인 | 상태 |
|---|---|
| 회원 OAuth(kakao/naver/google)·refresh·logout·me | ✅ |
| 관리자 인증·회원관리·관리자관리 | ✅ |
| 여행지 `GET /places/:id`·`/places`(목록)·관리자 CRUD | ✅ |
| `/me/summary`·`/me/progress/provinces`·`/discovery/today` | 📐 |
| `/regions/:code`(상세)·`/regions/:code/places`·`recommended` | 📐 |
| `/scoring/places/:id`·`/places/:id/compositions`·`/places/:id/certifications` | 📐 |
| 인증 `presigned`·`POST /certifications`(+멱등) | 📐 |
| `/me/dogam/*`·`/me/profile`·`/me/collections`·`/rankings` | 📐 |
| 약관 `/agreements/current`·`/me/agreements` | 📐 |

---

## 이번 정리에서 확정한 결정 (Decision Log)

1. **`/me/summary` 단일 현황 출처** — 홈·도감 헤더·마이페이지가 모두 같은 `progress` 사용. 별도 `/me/dogam/overview`는 제거(중복 제거). 계산 원천은 `user_stat` 한 곳.
2. **점수 분리** — place 응답에 점수를 박지 않고 `/scoring/places/:id`로 분리(룰/가중치/이벤트 배수 확장성).
3. **인증 = 작성·제출 / 완료 2화면** — 작성(`dto-certify-submit`)에서 score-preview + presigned + `POST /certifications` 호출, 완료(`dto-certify-result`)는 그 응답을 렌더(신규 호출 없음).
4. **멱등성 키** — 점수 지급 POST(`/certifications`)에 `Idempotency-Key` 헤더로 중복 제출 방지.
5. **위치·구도 체크** — 클라 프리뷰 + 서버 제출 응답(`proximityPass`/`compositionMatch`)이 최종 판정. 별도 검증 엔드포인트 불필요.
6. **스플래시·카메라는 신규 API 없음** — 각각 홈 데이터/compositions 재사용.
7. **페이지네이션** — 앱 피드는 커서(keyset), 관리자 목록은 오프셋.
8. **용어** — region.level = `PROVINCE`(도/시·도) / `DISTRICT`(시·군·구). sido/sigungu 표기 폐기.
9. **다국어** — 콘텐츠 테이블별 `_trans`(KO 폴백), `Accept-Language` → `RequestContext.locale`.

---

## 다음 구현 후보 (의존도 순)
1. **place 보강** — `place_rating`·`place_image`·`place_composition` (여행지 상세 화면 완성).
2. **TourAPI 관광지 동기화** — 관광지 ingestion + 캐노니컬 매칭.
3. **인증 + 점수 루프** — `certification` + `scoring`(룰/배수/원장 `score_event` + `user_stat`) — 앱 핵심 루프.
4. **도감/진행도·랭킹** — `user_stat` 집계 위에 `/me/dogam/*`·`/rankings`.
