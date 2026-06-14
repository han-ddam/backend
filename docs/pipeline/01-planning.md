# 한땀 (han-ddam) — Product Plan (Stage 1: Planning)

> Status: greenfield. Repo currently contains no application code (only `.claude/`).
> Stack is FIXED (see NFRs): NestJS + Drizzle ORM + PostgreSQL/PostGIS.
> This document is a product/feature plan. It deliberately does NOT design architecture, schema, or classes — that is the Architect's job.

---

## 1. Problem

Domestic and inbound travelers in Korea lack a single, motivating way to discover, visit, and *record* places at the granularity of Korea's 228 시·군·구. 한땀 is a gamified travel "도감" (collectible album): users fill in places by photo-/drawing-certifying real visits, and progress is tracked along two independent axes — administrative region coverage and themed-collection completion. Verified, high-quality user content can flow back to the Korea Tourism Organization (한국관광공사 / TourAPI) as official assets and contest entries, creating a content-to-official-asset feedback loop. The core challenge is making certification trustworthy (anti-fraud), keeping multilingual official place data coherent (the #1 risk: shared spotId is not guaranteed across KO/EN/JA/ZH), and turning visits into a fun, social, ranked collecting experience — while a data-driven policy can steer attention toward 인구감소지역 (declining-population regions).

---

## 2. Goals / Non-goals

### Goals
- Let users discover spots and certify visits with photo/drawing, with trustworthy verification.
- Track and surface **two first-class progress axes**: (A) region progress % per 시·군·구, (B) collection completion N/M per themed collection.
- Make themed **collections** the primary 도감 experience, as social objects (likes, trending, owner) supporting both **curated/official** and **user-created (UGC)** collections.
- Ingest and normalize TourAPI content (spots, festivals, images, courses) in 4 languages (KO/EN/JA/ZH) under a coherent shared identity.
- Provide a 4-level challenge system and rankings/percentiles, with a **data-driven policy weighting** (e.g. 1.5x for declining-population regions) applied *consistently* across all scoring surfaces.
- Surface time-sensitive "지금 찍으면 예쁜 장소" guidance (golden-hour / sunrise / sunset / D-day) computed per coordinates + date.
- Enable the contest feedback loop: match user content to official contests with staged consent and structured metadata.
- Support core social features (friends, likes, browsing others' 도감), reviews with keyword tags, and notifications.
- Provide admin/ops tooling for curation, moderation, and editing policy values.

### Non-goals (YAGNI — most important section)
- **No e-commerce.** No catalog/cart/checkout/payments/inventory of any kind.
- **No OpenSearch / dedicated "visual search" engine** at MVP — use PostgreSQL full-text search.
- **No 5-styles-at-once AI illustration.** On-demand, single style only; multi-style batch is deferred.
- **No 4×4 (16-cell) ranking matrix.** MVP rankings = national + region scope only; theme-scope and friend-scope rankings are later.
- **No Cognito / third-party auth provider** — own JWT auth.
- **No Glue/Athena analytics pipeline, no table partitioning** at MVP.
- **No SQS** — use BullMQ (Redis) for background jobs initially.
- **No hardcoded scoring weights** — but also no general "rules engine"; a simple policy table is enough.
- **No automatic publishing of user content as official assets** without explicit, staged consent (legal gate).
- We are **not** building a generic CMS; admin scope is limited to curation, moderation, and policy values.

---

## 3. User stories

Primary happy path:
- As a **traveler**, I want to see a map showing my visit progress % per 시·군·구, so that I know where I've been and what's left.
- As a **traveler**, I want themed collections (e.g. "한강 피크닉 명소 모음") shown as N/M progress with empty "여기 가기" slots, so that I have concrete goals to complete.
- As a **traveler**, I want to capture a photo in-app at a spot and have my visit certified, so that the slot fills and my stats update.
- As a **traveler**, I want to draw/illustrate a place or convert my photo to art, so that I can fill 도감 slots creatively.
- As a **traveler**, I want to see my profile stats (방문 스팟 count, 완성 도감 count, 전국 순위 + percentile like 상위 23%), so that I feel progress and status.
- As a **traveler**, I want challenges (region/theme/season/도감-completion/foreign-bingo) with rewards, so that I have reasons to visit more and varied places.
- As a **creator**, I want to build my own themed collection (UGC playlist) with an owner handle, so that others can follow and complete it.
- As a **discoverer**, I want a discovery feed sorted by 순위 / 추천 / 테마 / 지역 with "지금 찍으면 예쁜 장소" cards (golden-hour/sunrise/sunset/D-day), so that I know the best time and place to shoot.
- As a **social user**, I want to like collections, follow people, and browse others' 도감, so that the experience is social.
- As an **inbound foreign visitor**, I want spots/festivals/courses and UI in my language (EN/JA/ZH), so that I can use the product.
- As a **contributor**, I want to consent (in clear stages) and submit my certified content to official 관광공사 contests in one click, so that my work can become an official asset and reach the hall of fame.
- As an **ops/admin**, I want to curate official collections, moderate UGC before it goes public, and edit policy weights, so that content quality and policy goals are maintained.

Critical edge cases:
- As a **system**, I want to reject or flag certifications where in-app device GPS does not match the spot location, so that fake visits don't count.
- As a **traveler**, I want a duplicate/retried certification submission to not double-count, so that scores stay correct (idempotency).
- As a **content owner**, I want my photo blocked from public/contest exposure if it fails moderation, so that inappropriate content never becomes an official asset.
- As an **inbound visitor**, I want a place to still resolve correctly even when its KO and EN/JA/ZH TourAPI records don't share an id, so that multilingual content stays unified.
- As a **traveler in a declining-population region**, I want my actions there to consistently earn the policy-weighted bonus across cert score, challenge progress, rankings, recommendations, and notifications.

---

## 4. Functional requirements

Numbered, testable. (US = user story above.)

**Place data & i18n**
1. The system shall ingest TourAPI data (spots, festivals, images, courses) on a periodic schedule and normalize it into internal place records. (US: inbound, discoverer)
2. The system shall store and serve content in KO/EN/JA/ZH for spots, **festivals, and courses** (not spots only). (US: inbound)
3. The system shall maintain a single canonical identity per real-world place and provide a **coordinate + name fallback matching strategy** for cases where TourAPI ids differ across languages. (US: inbound, edge case) — addresses Risk #1.
4. The system shall expose recommended spots and "unvisited place" suggestions per region. (US: traveler/map)

**Progress (two axes)**
5. The system shall compute and display region progress % per 시·군·구 across all 228 regions. (Axis A) (US: traveler/map)
6. The system shall compute and display collection completion as N/M with empty slots labeled "여기 가기". (Axis B) (US: traveler/dogam)

**Collections**
7. The system shall support **curated/official collections (no owner)** and **user-created collections (with an owner handle)** as a single first-class concept. (US: creator, ops)
8. The system shall let users create, edit, and populate their own collections (UGC playlists). (US: creator)
9. The system shall support likes on collections and expose like counts, a weekly trending feed ("이번 주 급상승"), and a "새로 등록된 도감" (newly added) feed — applicable to both curated and UGC collections. (US: social, discoverer)

**Certification**
10. The system shall capture photo/drawing certification via in-app camera and record **app-captured device GPS at upload time, server-side, as the primary location signal** (NOT EXIF GPS). (US: traveler, edge case) — addresses Risk #2.
11. The system shall use EXIF and AI landmark assist as **secondary/supporting** signals, and shall treat EXIF GPS as untrusted (spoofable/strippable). (Risk #2)
12. The system shall support a QR-stamp certification option where available. (US: traveler)
13. The system shall make certification submission **idempotent** so retries/duplicates do not double-count. (US: edge case) — addresses Risk #5.
14. On a successful certification, the system shall update both progress axes, profile stats, relevant challenge progress, and rankings from a **single source of truth for scores**. (US: traveler) — addresses Risk #4.

**AI illustration**
15. The system shall convert a user photo to an art style **on demand, one style per request** (no multi-style batch at MVP). (US: traveler)

**Challenges & policy weighting**
16. The system shall support a 4-level challenge taxonomy: REGION / THEME / SEASON / DOGAM-completion / FOREIGN_BINGO. (US: traveler)
17. The system shall apply a **data-driven policy weighting** (e.g. 1.5x for the 89 declining-population 시·군·구) consistently across: certification score, challenge progress, rankings, recommendation weighting, and notification curation. Weights shall be editable via a policy table, never hardcoded. (US: traveler, ops)

**Discovery & time-sensitive guidance**
18. The system shall provide a discovery feed with sort tabs 순위 / 추천 / 테마 / 지역. (US: discoverer)
19. The system shall compute and display sunrise, sunset, and golden-hour windows (and D-day countdowns) per coordinates + date for "지금 찍으면 예쁜 장소" cards. (US: discoverer)

**Recommendations & routing**
20. The system shall cluster best photo-spots and recommend courses, distinguishing **domestic vs foreign-inbound** audiences, using Kakao Mobility routing. (US: discoverer)

**Rankings**
21. The system shall compute user rankings and percentile (e.g. 상위 23%) at **national and region scope** for MVP. (US: traveler)

**Reviews & social**
22. The system shall support reviews with photo + text + keyword tags (포토존 / 주차 / 야경 / 외국인친화 / 접근성). (US: social)
23. The system shall support friends/follow, likes, and browsing other users' 도감. (US: social)

**Notifications**
24. The system shall send location-based and policy-based push notifications and manage device tokens. (US: traveler)

**Contest feedback loop**
25. The system shall auto-match eligible user content to official 관광공사 contests. (US: contributor)
26. The system shall require a **staged 4-step consent** flow before any user content is submitted to a contest or used as an official asset. (US: contributor) — relates to Risk #7.
27. The system shall **require passing AI landmark verification as a gate** on the contest-submission path. (US: contributor, edge case) — addresses Risk #2.
28. The system shall **proactively moderate** images (NSFW/inappropriate) BEFORE any public or contest exposure, in addition to handling reactive user reports. (US: edge case) — addresses Risk #3.
29. Contest submissions shall carry structured metadata: spotId, regionCode, capturedAt, themeTags, style, licenseScope. (US: contributor)
30. The system shall make contest submission **idempotent**. (Risk #5)
31. The system shall provide a hall-of-fame view of selected/winning submissions. (US: contributor)

**Admin/ops**
32. The system shall provide admin tooling to curate official collections, moderate content (proactive + reactive queues), and edit policy values. (US: ops)

**Auth**
33. The system shall authenticate users via its own JWT-based auth (no external identity provider at MVP). (Non-goal: Cognito)

---

## 5. Non-functional requirements

- **Stack (fixed):** NestJS (API), Drizzle ORM, PostgreSQL with **PostGIS** as the geospatial core. Background jobs via **BullMQ (Redis)**. PostgreSQL full-text search for search at MVP. (Schema/design is out of scope here.)
- **Geospatial:** region containment (point-in-polygon for 시·군·구), proximity queries, and distance checks for GPS certification must be performant at national scale (228 regions, large spot set).
- **Multilingual:** all user-facing place/festival/course content available in KO/EN/JA/ZH; UI localization for at least these 4 locales.
- **Consistency / single source of truth:** scores (cert score, challenge progress, rankings) must derive from one authoritative computation path; no divergent score calculations across surfaces.
- **Idempotency:** certification and contest submission endpoints must be safe under retries and network duplication.
- **Anti-fraud integrity:** primary location trust is server-recorded app device GPS at upload; EXIF treated as untrusted; AI landmark verification required on contest path.
- **Content safety:** no UGC reaches public/contest surfaces without passing proactive moderation.
- **Performance:** discovery feeds, map progress, and time-sensitive cards should feel instant on mobile; trending/ranking computations may be eventually consistent (near-real-time acceptable) but must be reproducible.
- **PII & compliance:** stores user accounts, precise location traces, and user-generated photos (which may contain people). Requires privacy-respecting handling of location data and a clear data-retention posture. Image **rights/licensing consent** is a compliance-critical flow (see Open Questions).
- **Auditability:** consent events, moderation decisions, policy-value changes, and score-affecting events should be auditable.
- **Scale assumptions (MVP):** see Open Questions; design should not preclude growth but partitioning/Glue/Athena are explicitly deferred.

---

## 6. Open questions / assumptions

### Open questions (genuine product/legal decisions — NOT to be invented)
- **Q1 (Risk #7, legal) — RESOLVED (core):** Copyright/ownership of the image **stays with the creator (the individual)** — no transfer to 관광공사. When used as an official asset, it is a **license with mandatory creator attribution**. So the model = *creator retains ownership + non-transfer + attribution-required license*. REMAINING sub-points (defaulted, can change): commercial use → default limited to non-commercial promotion; exclusivity → default non-exclusive (creator may still freely use their own photo); revocability/term → TBD.
- **Q2:** What are the precise rules and reward semantics of each challenge level, and how do rewards work (badges only? unlocks? real-world prizes via contests)?
- **Q3:** What is the authoritative source and update cadence for the 89 declining-population region list, and is the weight a single global value (1.5x) or per-region?
- **Q4:** GPS proximity tolerance for a valid certification (meters), and behavior in GPS-poor environments (indoors, urban canyon) — accept with lower confidence, or reject?
- **Q5 — RESOLVED:** 4 staged consent steps: (1) **in-app public** — other users may view my 도감 (in-app only, served as a **low-res formatted derivative**, NOT the original); (2) **ops review consent** — 관광공사 ops team quality/eligibility review (still in-app only); (3) **official-channel posting** — **external public exposure STARTS here**, posted with creator attribution, uses the original; (4) **contest submission** — formal entry, original + attribution. Publish point = step 3 (steps 1–2 stay in-app). Image tiering: in-app sharing = downscaled variant; original reserved for the creator + official-asset/contest export. **Legal basis for official-channel use (step 3+) and the attribution/non-transfer license is a versioned Terms/약관 the user accepts** (recorded with acceptance audit), NOT per-click legalese — legal authors the 약관 text. This also resolves Q1's remaining sub-points (commercial-use, revocability) inside the 약관.
- **Q6:** Moderation operating model — fully automated pre-publish, human-in-the-loop, or hybrid? SLA for review?
- **Q7:** Which AI providers/services are assumed for (a) landmark verification, (b) art-style illustration, (c) NSFW moderation? Build vs buy, and cost ceilings.
- **Q8:** TourAPI quotas/rate limits and sync cadence; how stale can official content be?
- **Q9:** Does drawing-based certification require a real visit (GPS) too, or is it allowed without on-site presence?
- **Q10:** Expected user scale (MAU), content volume, and traffic shape — needed to size NFR targets concretely.
- **Q11:** Trending/ranking exact formula and window definitions ("이번 주" = rolling 7d vs calendar week?), and tie-breaking.

### Assumptions (made to keep the plan moving; flag if wrong)
- A1: 시·군·구 administrative boundary geometries are available to load into PostGIS.
- A2: "Visit" = one accepted certification at a spot; region % = visited spots / recommended-or-eligible spots in that region (exact denominator TBD — see Q with ops).
- A3: A spot can belong to multiple collections; a collection slot maps to a specific spot.
- A4: One certification can simultaneously advance multiple collections and challenges containing that spot.
- A5: Foreign-bingo and inbound course recommendations target non-KO-locale users primarily.
- A6: MVP targets mobile clients consuming a single NestJS REST/JSON API.
- A7: Likes and follows are public counts; no private/anonymous mode at MVP.

---

## 7. Success metrics

- **Activation:** % of new users who complete ≥1 certification within first session/week.
- **Core loop engagement:** certifications per active user per week; collections advanced per user.
- **Completion:** number of collections completed (N=M) per user; distribution of region progress %.
- **Policy effectiveness:** share of certifications/visits occurring in declining-population regions vs baseline (does the 1.5x weighting move behavior?).
- **Social health:** likes per collection, follows per user, % of users browsing others' 도감.
- **UGC quality/safety:** moderation pass rate; % inappropriate content caught pre-publish (target: ~100% before public).
- **Feedback loop:** number of contest submissions, consent completion rate, and items reaching hall of fame.
- **Trust:** certification fraud-rejection rate and false-rejection complaints (balance).
- **i18n reach:** active inbound users by locale (EN/JA/ZH).
- **Reliability:** duplicate/double-count incidents (target: 0, via idempotency).

---

## 8. Scope / phasing

### MVP (smallest valuable slice)
The core collecting loop + the two progress axes + trustworthy certification, in KO first with the i18n model in place.
- Auth (own JWT).
- TourAPI sync for spots (+ basic festivals/courses), normalization, and the **coordinate+name fallback identity** strategy. i18n storage model for KO/EN/JA/ZH (KO populated first).
- Map tab: region progress % (Axis A), recommended + unvisited suggestions.
- Dogam tab: themed collections (curated + UGC), N/M progress, "여기 가기" slots; likes; trending + newly-added feeds.
- Certification: in-app photo capture with **server-side device GPS** as primary signal; idempotent submission; single-source-of-truth scoring updating both axes, stats, challenges, rankings.
- Discovery feed (순위/추천/테마/지역) with **sun-time/golden-hour/D-day** cards.
- Challenges: the 4-level taxonomy with **data-driven policy weighting** applied consistently.
- Rankings + percentile at **national + region scope only**.
- Reviews with keyword tags; friends/follow; browse others' 도감.
- Notifications + device tokens (location- and policy-based).
- Contest loop: auto-match, **staged 4-step consent**, **AI-landmark gate**, **proactive moderation**, structured metadata, idempotent submission, hall of fame.
- AI illustration: **on-demand single style**.
- Admin/ops: curation, moderation queues, policy-value editing.

### Later (deferred)
- AI illustration multi-style batch (5-at-once).
- Theme-scope and friend-scope rankings (toward the fuller 4×4 matrix).
- OpenSearch / visual search (replace PG FTS only if needed).
- Glue/Athena analytics, table partitioning, SQS migration.
- Richer course/routing personalization beyond domestic-vs-inbound split.

---

## Handoff to design

The 3–4 hardest design questions this plan implies for the Architect:

1. **Canonical place identity across 4 languages.** How to model one real-world place when TourAPI ids are not shared across KO/EN/JA/ZH, including the coordinate+name fallback matching and i18n for spots **and** festivals/courses (Risk #1). This shapes nearly everything downstream.
2. **Single source of truth for scoring with consistent policy weighting.** One authoritative scoring path feeding cert score, both progress axes, challenge progress, rankings, recommendations, and notification curation — with the declining-population weight injected from a data-driven policy and idempotent under retries (Risks #4, #5).
3. **Trustworthy certification pipeline.** Server-side device-GPS-as-primary verification + PostGIS proximity/containment + AI landmark gate (required on contest path) + proactive image moderation before public exposure, as one coherent, auditable flow (Risks #2, #3).
4. **Collections as hybrid social objects + dual progress.** Unified model for curated (ownerless) and UGC (owned) collections that powers N/M completion, likes, trending/newly-added feeds, and coexists with the independent region-% axis.

---

## 11. Figma 상세 화면 반영 (요구사항 보강)

전체 화면 시안(홈/지도/도 상세/여행지 상세/인증/도감/마이/랭킹/로그인)에서 확인된 상세 요구사항.

### A. 점수 · 레벨 · 랭킹 (게임화 상세)
- **인증 1건당 점수**: 기본 점수(예: **+15**) × **지역 가중치(인구감소지역 ×1.5)** → 화면에 명시 표시.
- **레벨/EXP 시스템**: "여행수집가 **Lv.33**", EXP 2,450/3,200 — **점수와 별개의 레벨 곡선** 필요(누적 점수→레벨 환산 or 별도 EXP).
- **랭킹**: 전국 순위(예: **127위 / 15,284명**) + **percentile(전국 상위 1%)** + 리더보드(point 기준) + **칭호/뱃지**("지도파미", "여행마스터" 등).
- → 설계 영향: `user_score`(점수 SSOT)와 `user_level`(EXP/레벨)을 구분, `ranking`/`badge` 모델 추가.

### B. 진행도 3계층
- **전국** → **시·도(집계)** → **시·군·구**. 전체 지도에 시·도별 %(서울·경기 80% 등) + 누적 카운트.
- **도 상세**: 도 진행도(70%), 수집현황(15/21곳), 여행지 목록(**방문완료/방문예정** 뱃지), filter(전체/방문완료/방문예정).
- **도감**: **지역별 / 테마별 / 최근수집** 탭, 전국 수집현황(102/161), 지역 카드 %+N/M, 일부 지역 **잠김(locked)**(예: 세종) → 잠금/해금 조건 정의 필요.
- → 진행도는 시·군·구 기준 집계가 시·도로 롤업. 도감=지역별+테마별(컬렉션).

### C. 여행지(spot) 상세
- **평점**(별점, 예: 4.8), **태그**, 지역 가중치(×1.5), 획득 점수.
- **여행 인증 미션 + 구도 추천**(예: "정자+동해 바다", "정자+바위+파도") — **초기엔 큐레이션 데이터, 데이터 쌓이면 AI 고도화**(시안 주석).
- **다른 여행객의 인증 사진** 갤러리.
- → 설계 영향: spot에 평점 집계, `recommended_composition`(구도 추천), 인증 미션 데이터.

### D. 인증 플로우 상세
- 촬영/선택 → **장소 위치 확인(GPS)** + **사진 구도 확인(AI 보조)** → **여행 한 줄 기록(caption)** → **공개 설정(나만 보기 / 전체 공개)** → 점수 획득.
- 인증 완료 → 도감 수집 + 도 진행도 갱신(70%→74%) + 점수 +15.
- → `certification`에 `caption`, `visibility(PRIVATE|PUBLIC)`, 구도확인 결과 필드 추가.

### E. ⚠️ 소셜 로그인 provider 불일치 (결정 필요)
- **Figma 로그인 화면**: **카카오 + Google** (네이버 없음).
- **현재 구현**: 카카오 + **네이버**.
- → **확정 필요**: 카카오 + 네이버 + 구글(셋 다)? 아니면 카카오 + 구글? `auth_provider` enum/어댑터에 영향.

### F. 다국어
- 시안 주석 "유저(영어/일본/중국)" → 인바운드 다국어 확정. (i18n `_trans` 테이블 패턴으로 이미 채택)

### G. 디자인
- 테마 컬러(녹색 계열) 등은 프론트 영역.

### 보강으로 새로 생기는 결정/모델
1. 소셜 provider 목록 확정 (E) — **현재 코드와 충돌**, 우선 처리 권장.
2. EXP/레벨 시스템(점수와 별개).
3. 칭호/뱃지 시스템.
4. spot 평점 + 구도추천 + 인증미션.
5. 인증 caption + visibility.
6. 지역 잠금(locked) 조건.
