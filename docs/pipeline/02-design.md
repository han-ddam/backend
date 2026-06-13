# 한땀 (han-ddam) — Technical Design (Stage 2: Architecture)

> Input: `01-planning.md` (FR1–FR33, NFRs, handoff #1–#4, open questions Q1–Q11).
> Stack (FIXED): NestJS (REST/JSON) · Drizzle ORM · PostgreSQL + PostGIS · Redis · BullMQ · S3+CloudFront · sharp · exifr · suncalc · firebase-admin · Kakao Mobility · pluggable AI ports.
> Greenfield: this document establishes the canonical patterns. No legacy to respect.
> Goal of this design: every module is understandable and testable in isolation behind a well-defined interface. Spatial SQL is centralized. Scoring has exactly one authoritative path.

This document does NOT write implementation. It specifies modules, contracts, schema, flows, and decisions a coder can build without guessing. Where a decision is genuinely blocked on a product/legal open question, it is marked **[BLOCKED: Qn]** with a safe default and a config seam so the coder is never stuck.

---

## 0. Reading guide / requirement traceability

| Area | FRs | Handoff | Owning module(s) |
|---|---|---|---|
| Canonical place identity + i18n + TourAPI sync | FR1–FR4 | #1 | `places`, `ingestion` |
| Region progress (Axis A) | FR5 | #4 | `progress`, `geo` |
| Collections + N/M (Axis B) + likes/trending/new feeds | FR6–FR9 | #4 | `collections`, `feeds` |
| Certification pipeline | FR10–FR14, FR27–FR28 | #2,#3 | `certification`, `verification`, `moderation`, `scoring` |
| AI illustration | FR15 | — | `illustration` |
| Challenges + policy weighting | FR16–FR17 | #2 | `challenges`, `policy`, `scoring` |
| Discovery feed + sun-time cards | FR18–FR19 | — | `discovery`, `suntime` |
| Recommendations + routing | FR20 | — | `recommendations`, `routing` |
| Rankings + percentile | FR21 | #2 | `rankings`, `scoring` |
| Reviews + keyword tags | FR22 | — | `reviews` |
| Social (friends/likes/browse) | FR23 | #4 | `social` |
| Notifications + device tokens | FR24 | — | `notifications` |
| Contest loop + 4-step consent + hall of fame | FR25–FR31 | #3 | `contests`, `consent`, `verification`, `moderation` |
| Admin/ops + audit | FR32 | — | `admin`, `audit` |
| Auth (own JWT) | FR33 | — | `auth`, `users` |

---

## 1. Architecture overview

A single NestJS monolith (modular monolith) exposing one REST/JSON API for mobile clients (A6). Background work runs in BullMQ workers hosted in the **same codebase** but launched as a separate process (`worker` bootstrap) so API latency is never blocked by AI/image work. PostgreSQL+PostGIS is the system of record; Redis serves cache, rankings sorted sets, sessions/refresh-token denylist, rate limiting, and BullMQ. S3 stores image originals/variants, fronted by CloudFront.

```
                         Mobile clients (KO/EN/JA/ZH)
                                   │ REST/JSON (+JWT)
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  NestJS API process  (thin controllers → services → repositories)       │
│                                                                        │
│  auth users  places collections progress challenges discovery rankings │
│  certification reviews social notifications contests admin             │
│        │ emit domain events (in-proc EventBus → outbox)                │
│        ▼                                                               │
│  ┌─ DOMAIN EVENT OUTBOX (PG table, transactional) ─┐                   │
│  └──────────────────────────────────────────────────┘                 │
└───────────┬───────────────────────────────┬───────────────────────────┘
            │ Drizzle (sql`` for PostGIS)    │ enqueue
            ▼                                ▼
   ┌──────────────────┐            ┌───────────────────────────┐
   │ PostgreSQL+PostGIS│           │ Redis (cache / ZSET /      │
   │ - system of record│           │ sessions / ratelimit / Bull)│
   │ - GIST spatial idx│           └─────────────┬─────────────┘
   │ - FTS (tsvector)  │                         │ BullMQ
   └──────────────────┘                          ▼
                                  ┌────────────────────────────────────┐
                                  │  Worker process (BullMQ consumers)   │
                                  │  queues: ai-verify · ai-illustrate · │
                                  │  moderation · image-process ·        │
                                  │  push-batch · ingestion-sync ·       │
                                  │  outbox-relay · trending-snapshot     │
                                  └───────┬───────────────┬──────────────┘
                                          │ ports/adapters │
                            ┌─────────────┴──┐   ┌────────┴───────────────┐
                            │ S3 + CloudFront │   │ AI adapters (TBD Q7):  │
                            │ sharp/exifr      │   │ landmark · style · nsfw │
                            └─────────────────┘   │ FCM/APNs · Kakao · TourAPI│
                                                  └────────────────────────┘
```

**Why modular monolith, not microservices:** MVP scale (Q10 unknown) does not justify network-split services; a modular monolith with strict module boundaries + an event outbox gives us isolation and testability now and a clean seam to extract later. Non-goals explicitly defer SQS/Glue/Athena — BullMQ + PG cover all async needs.

**Process topology:** identical image, two entrypoints — `main.ts` (HTTP) and `worker.ts` (BullMQ processors only, no HTTP listener). Both share `src/modules/*` so domain logic is written once and reused by API and workers.

---

## 2. Bounded contexts / modules

Each bounded context is a NestJS module with: a **public provider** (the only thing other modules may inject — exported via the module's `exports`), internal services/repositories that are NOT exported, zod DTOs at the edge, and (where relevant) event emitters/handlers. Cross-module calls go **only** through the exported public interface or via domain events — never by reaching into another module's repository.

Convention for every module:
```
modules/<ctx>/
  <ctx>.module.ts            // wiring; exports ONLY the public facade
  <ctx>.controller.ts        // thin: validate (zod pipe) → call service → map to DTO
  <ctx>.service.ts           // domain logic; the public facade interface lives here
  <ctx>.repository.ts        // Drizzle access; the ONLY place that touches db for this ctx
  dto/*.ts                   // zod schemas + inferred types (request/response)
  events/*.ts                // event payload types this ctx emits/handles
```

### 2.1 `platform` (shared infra, not a bounded context)
Houses cross-cutting providers injected everywhere: `DrizzleService` (db handle), `RedisService`, `BullModule` registrations, `ClockService` (injectable `now()` for deterministic tests), `IdService` (UUIDv7 generator), `ConfigService` (zod-validated env), global `ZodValidationPipe`, global exception filter, `RequestContext` (locale + userId), and the `EventBus`+`OutboxService`. No domain logic.

### 2.2 `auth` + `users` (FR33)
- **Responsibility:** identity, JWT issue/refresh/revoke, password (argon2id), guards.
- **Public interface:** `JwtAuthGuard`, `RolesGuard`, `@CurrentUser()` decorator, `AuthService.issueTokens(userId)`, `UsersService.getPublicProfile(userId)`, `UsersService.getProfileStats(userId)`.
- Access tokens are short-lived JWT (signed, stateless); refresh tokens are opaque, stored hashed, with a Redis denylist for revocation. Roles: `USER`, `ADMIN`, `MODERATOR`, `CURATOR`.

### 2.3 `places` (FR1–FR4, handoff #1) — **canonical identity core**
- **Responsibility:** the single canonical `place` entity, per-locale i18n rows, the coordinate+name matcher, place lookup/search.
- **Public interface:** `PlacesService.getCanonical(placeId, locale)`, `findByExternalRef(provider, contentId, locale)`, `matchOrCreate(candidate)`, `searchFts(query, locale, regionCode?)`, `resolveRegion(placeId)`, `PlacesRepository` spatial methods are internal.
- Owns the **canonical place identity** design (§3.1, §7-Decision-A). The matcher is a pure, isolated, unit-testable service (`PlaceMatcher`) consuming `(coords, name, kind)` and returning `{matchedPlaceId, confidence}`.

### 2.4 `geo` (region geometry + spatial primitives)
- **Responsibility:** the ONLY module that owns region polygons and the centralized spatial repository. All `ST_*` SQL lives here behind typed methods (handoff #3, Drizzle/PostGIS constraint).
- **Public interface:**
  - `GeoService.regionContaining(point): Promise<RegionCode | null>` → `ST_Contains`
  - `GeoService.spotsWithin(point, meters, filter?)` → `ST_DWithin`
  - `GeoService.distanceMeters(a, b)` → `ST_Distance` on geography
  - `GeoService.clusterSpots(bbox, eps, minPts)` → `ST_ClusterDBSCAN` (recommendations)
  - `GeoService.regionForSpot(spotId)`
- Rationale: isolating spatial SQL here means proximity/containment is testable against a seeded PostGIS test DB in one place, and the rest of the system stays in the Drizzle query-builder DSL.

### 2.5 `ingestion` (FR1–FR2)
- **Responsibility:** TourAPI sync (spots, festivals, courses, images, all 4 locales) on a schedule; normalization; calls `places.matchOrCreate`. Runs in the worker process only.
- **Public interface (admin-triggerable):** `IngestionService.runSync(scope, locale)`, `IngestionService.runMatchPass()`. Emits `place.ingested`, `place.matched`, `place.match.ambiguous`.
- Adapter: `TourApiPort` (pluggable; honors quotas — **[BLOCKED: Q8]** cadence/quota → config-driven schedule, default daily full + hourly delta).

### 2.6 `collections` + `feeds` (FR6–FR9, handoff #4)
- **Responsibility:** unified curated/UGC collection entity, slots→places, likes, trending + newly-added feeds.
- **Public interface:** `CollectionsService.create/edit/addSlot/reorder`, `getCollection(id, locale)`, `listByRegion/Theme`, `like/unlike`, `CollectionsService.collectionsContaining(placeId)` (used by scoring on certification). `FeedsService.trending(window)`, `FeedsService.newlyAdded()`.
- Trending computed in Redis ZSET + periodic PG snapshot (§7-Decision-D).

### 2.7 `progress` (FR5, FR6, FR14, handoff #4)
- **Responsibility:** the two independent progress axes as derived/materialized state.
  - Axis A: `UserRegionProgress(userId, regionCode, visitedCount, eligibleCount, percent)`.
  - Axis B: `UserCollectionProgress(userId, collectionId, filledSlots, totalSlots)`.
- **Public interface:** `ProgressService.getRegionMap(userId)`, `getCollectionProgress(userId, collectionId)`, and **internal-only event handler** `onVisitCertified(event)` that updates both axes. Progress is a **consumer of scoring events**, never a parallel calculator.

### 2.8 `scoring` (FR14, FR17, handoff #2) — **single source of truth**
- **Responsibility:** the ONE authoritative computation that turns an accepted visit into score deltas, applying policy weight, then emits exactly one canonical domain event. Pure functions for the math (testable in isolation), thin orchestration around them.
- **Public interface:** `ScoringService.applyCertification(certId)` (idempotent; see §6). It does NOT itself update rankings/progress/challenges — it emits `visit.certified` (with computed `baseScore`, `policyWeight`, `weightedScore`, `regionCode`, `spotId`, affected collections/challenges) into the outbox. Every downstream surface (progress, challenges, rankings, recommendations, notifications) consumes that single event. This guarantees "no divergent score calculations."

### 2.9 `policy` (FR17)
- **Responsibility:** the data-driven weight table; resolves the multiplier for a region/context. Never hardcoded.
- **Public interface:** `PolicyService.weightFor(regionCode, context): number` (cached in Redis, invalidated on admin edit). Backed by `policy_weight` table. **[BLOCKED: Q3]** single global 1.5x vs per-region and source/cadence → table supports per-region rows with a global default row, so either answer fits without schema change.

### 2.10 `certification` (FR10–FR14, handoff #3)
- **Responsibility:** accept the in-app capture (image + **server-recorded device GPS** + clientCapturedAt + idempotency key), persist the immutable `certification` record, run the synchronous fast-path proximity/containment gate, enqueue async verification+moderation, and call `scoring.applyCertification` once a cert reaches `ACCEPTED`. QR-stamp variant (FR12).
- **Public interface:** `CertificationService.submit(cmd)`, `getStatus(certId)`.
- Owns the state machine (§5.3). Does not embed AI logic — delegates to `verification` and `moderation` ports.

### 2.11 `verification` (FR11, FR27)
- **Responsibility:** secondary/supporting signals — EXIF parse (untrusted, advisory) + AI landmark verification (BullMQ). Emits `verification.completed{certId, landmarkPass, confidence}`. AI is a **port** (`LandmarkVerifierPort`) — **[BLOCKED: Q7]** provider.
- AI-landmark is a **required gate only on the contest path** (FR27), advisory on the normal cert path (so a working app GPS visit still certifies).

### 2.12 `moderation` (FR28, FR32)
- **Responsibility:** proactive NSFW pre-publish gate (BullMQ) + reactive report queue. Emits `moderation.decided{imageId, decision}`. No image becomes public/contest-eligible until `decision=PASS`. Port `NsfwModeratorPort` — **[BLOCKED: Q7]**; operating model (auto/human/hybrid) — **[BLOCKED: Q6]** → modeled as a queue with optional human-review state so any model fits.

### 2.13 `illustration` (FR15)
- **Responsibility:** on-demand single-style photo→art conversion (BullMQ). Port `StyleTransferPort` — **[BLOCKED: Q7]**. Explicitly no multi-style batch (non-goal). One job = one style.

### 2.14 `challenges` (FR16–FR17)
- **Responsibility:** 4-level taxonomy (`REGION | THEME | SEASON | DOGAM | FOREIGN_BINGO`), the matcher that maps a certified visit to in-progress challenges, reward state. Consumes `visit.certified`.
- **Public interface:** `ChallengesService.matchingChallenges(spotId, regionCode, themeTags, userId)`, `getUserChallenges(userId)`. Reward semantics — **[BLOCKED: Q2]** → reward stored as opaque `reward_spec` JSON; badges default.

### 2.15 `discovery` + `suntime` (FR18–FR19)
- **Responsibility:** feed with sort tabs (순위/추천/테마/지역) and time-sensitive cards. `suntime` wraps **suncalc** to compute sunrise/sunset/golden-hour per coords+date and D-day countdowns (pure, fully unit-testable with fixed clock).
- **Public interface:** `DiscoveryService.feed(tab, locale, userCtx, paging)`, `SunTimeService.windowsFor(coords, date)`.

### 2.16 `recommendations` + `routing` (FR20)
- **Responsibility:** cluster best photo-spots (`geo.clusterSpots`), recommend courses split domestic vs inbound (A5), Kakao Mobility routing via `RoutingPort`. Policy weight influences recommendation ranking (handoff #2).

### 2.17 `rankings` (FR21)
- **Responsibility:** national + region scope rankings + percentile (상위 N%) from Redis ZSET, snapshotted to PG. Consumes `visit.certified` (incrementing ZSET by `weightedScore`). **No theme/friend scope, no 16-cell matrix** (non-goal).
- **Public interface:** `RankingsService.userRank(userId, scope)`, `leaderboard(scope, regionCode?, paging)`, `percentile(userId, scope)`.

### 2.18 `reviews` (FR22), `social` (FR23), `notifications` (FR24)
- `reviews`: photo+text+keyword tags (enum: 포토존/주차/야경/외국인친화/접근성). Images go through `moderation` before public.
- `social`: follow/friend, like (delegates collection likes to `collections`), browse others' public 도감.
- `notifications`: device token registry + push send (FCM/APNs via firebase-admin), location-based and policy-based, batched via `push-batch` queue. Consumes `visit.certified`, `contest.matched`, etc.

### 2.19 `contests` + `consent` (FR25–FR31, handoff #3)
- **Responsibility:** auto-match eligible content to contests, the staged **4-step consent** flow, structured submission metadata, idempotent submission, hall of fame. Submission requires: consent complete AND `landmarkPass=true` AND `moderation=PASS`.
- **Public interface:** `ContestsService.autoMatch(certId)`, `ConsentService.advance(userId, submissionId, step)`, `ContestsService.submit(cmd, idempotencyKey)`, `hallOfFame()`. Consent steps (RESOLVED): 1 in-app-public(low-res) → 2 ops-review → 3 official-channel-posting (external public starts) → 4 contest-submission. The **legal basis for step 3 (official-channel use), attribution, and the non-transfer license is the user's accepted `agreement` version** (type OFFICIAL_CHANNEL / CONTENT_LICENSE), recorded in `user_agreement_acceptance` — i.e. resolved via versioned **약관**, not per-click legalese. `ConsentService` verifies the user has accepted the current required agreement version for the step; `licenseScope` is derived from that agreement. Remaining for legal: author the 약관 text per version (commercial-use & revocability sub-points, Q1).

### 2.20 `admin` (FR32) + `audit`
- `admin`: curate collections, moderation queues (proactive+reactive), edit policy values. `RolesGuard` enforced.
- `audit`: append-only `audit_log` writes for consent events, moderation decisions, policy changes, score-affecting events (NFR auditability). Public interface `AuditService.record(actor, action, target, before, after)`.

---

## 3. Data model

PostgreSQL + PostGIS. Drizzle schema in `src/db/schema/*.ts`. IDs are **UUIDv7** (time-sortable, index-friendly) generated app-side. `created_at/updated_at timestamptz`. Soft delete only where browse history matters (collections, reviews); hard structural rows are not soft-deleted.

### 3.1 Canonical place identity (handoff #1)

```
place                         -- the canonical real-world place (language-neutral)
  id              uuid pk
  kind            enum('SPOT','FESTIVAL','COURSE')
  coords          geometry(Point,4326)        -- canonical coordinate (GIST)
  region_code     varchar(10) fk -> region.code  -- resolved via ST_Contains at create
  match_status    enum('CANONICAL','PROVISIONAL','AMBIGUOUS')
  primary_locale  enum('KO','EN','JA','ZH')   -- locale that seeded it (usually KO)
  created_at, updated_at

place_i18n                    -- one row per (place, locale)
  place_id        uuid fk -> place.id
  locale          enum('KO','EN','JA','ZH')
  name            text
  description     text
  address         text
  search_tsv      tsvector                    -- generated; GIN index (FTS, FR-search)
  PK (place_id, locale)

place_external_ref            -- maps provider contentIds (may differ per locale) -> place
  provider        enum('TOURAPI', ...)
  external_id     text
  locale          enum('KO','EN','JA','ZH')
  place_id        uuid fk -> place.id
  matched_by      enum('CONTENT_ID','COORD_NAME_FALLBACK','MANUAL')
  match_confidence numeric(4,3)
  PK (provider, external_id, locale)

festival_detail (place_id pk fk, starts_on, ends_on, ...)   -- FR2 festivals
course_detail  (place_id pk fk, ordered stops via course_stop) -- FR2 courses
course_stop    (course_place_id fk, seq int, spot_place_id fk)
```

**Matcher (the #1 risk).** On ingest, for each `(provider, external_id, locale)`:
1. If a `place_external_ref` already exists → reuse its `place_id` (exact contentId path).
2. Else attempt **coordinate+name fallback** via `PlaceMatcher`: query candidate places within R meters (`ST_DWithin`, default R configurable, e.g. 80 m) of the same `kind`, score by normalized-name similarity (trigram `pg_trgm` similarity on `place_i18n.name`, with CJK-aware normalization) combined with distance. If best score ≥ `HIGH` threshold → attach a new `place_i18n` + `place_external_ref(matched_by=COORD_NAME_FALLBACK)`. If between `LOW` and `HIGH` → create `place_external_ref` but set `place.match_status=AMBIGUOUS` and emit `place.match.ambiguous` for admin review. If < `LOW` → create a NEW canonical `place`.
3. Region resolved via `geo.regionContaining(coords)`; if null (offshore/boundary), `region_code` stays null and flagged.

Thresholds and R are config (de-risk PoC target, §10). `pg_trgm` extension required.

### 3.2 Region geometry (geo)

```
region                                 -- 228 시·군·구 (+ optional 시·도 parent)
  code        varchar(10) pk           -- 행정구역 code
  name_ko/en/ja/zh  text
  parent_code varchar(10) null
  boundary    geometry(MultiPolygon,4326)  -- GIST index
  is_declining_pop boolean             -- denormalized convenience; source of truth = policy
```
GIST index on `region.boundary` (point-in-polygon containment), GIST on `place.coords` (proximity). These two indexes are the spatial-performance backbone (NFR geospatial @ national scale).

### 3.3 Certification & scoring (handoff #2, #3)

```
certification                          -- immutable audit record (FR10,FR14)
  id             uuid pk
  user_id        uuid fk
  spot_place_id  uuid fk -> place.id
  region_code    varchar(10)
  method         enum('PHOTO','DRAWING','QR')
  image_id       uuid fk -> image.id null      -- null for QR
  device_lat/lng double precision               -- SERVER-recorded app GPS (PRIMARY)
  device_point   geometry(Point,4326)           -- derived for ST_DWithin
  device_accuracy_m numeric null
  client_captured_at timestamptz
  exif_meta      jsonb null                      -- advisory only, untrusted (FR11)
  idempotency_key text not null                  -- UNIQUE(user_id, idempotency_key) FR13
  proximity_pass boolean                          -- synchronous fast-path result
  proximity_distance_m numeric
  landmark_pass  boolean null                      -- async; null until verified
  landmark_confidence numeric null
  moderation_status enum('PENDING','PASS','REJECTED') default PENDING
  status         enum('PENDING','PROXIMITY_FAILED','ACCEPTED','REJECTED','NEEDS_REVIEW')
  scored_at      timestamptz null                 -- set once scoring applied (idempotent guard)
  created_at
  UNIQUE(user_id, idempotency_key)                -- idempotency at DB level
  -- partial UNIQUE(user_id, spot_place_id) WHERE status='ACCEPTED'  => one visit per spot (A2)

image                                  -- S3-backed asset
  id, owner_user_id, s3_key_original, variants jsonb, width, height,
  is_public boolean default false,      -- flips true only after moderation PASS
  moderation_status enum(...)

score_event                            -- the ledger written by scoring (single source)
  id            uuid pk
  certification_id uuid UNIQUE fk        -- one score_event per cert (idempotent)
  user_id       uuid
  region_code   varchar(10)
  base_score    int
  policy_weight numeric(4,2)
  weighted_score numeric                 -- base_score * policy_weight
  created_at
```

`score_event` is the durable ledger; rankings/progress are projections that can be rebuilt from it (reproducibility, NFR). `certification.scored_at` + unique `score_event.certification_id` give idempotent scoring.

### 3.4 Collections & progress (handoff #4)

```
collection
  id, source enum('CURATED','USER'), owner_user_id uuid null,  -- null => curated
  title, theme_tags text[], region_code varchar(10) null, is_ordered boolean,
  like_count int default 0, slot_count int default 0,           -- denormalized counters
  visibility enum('PUBLIC','PRIVATE','PENDING_MODERATION'), created_at
collection_i18n (collection_id, locale, title, description) PK(collection_id,locale)
collection_slot
  collection_id fk, seq int null,            -- seq null when unordered
  place_id fk, label text null,              -- "여기 가기" rendered when user hasn't filled
  PK(collection_id, place_id)
collection_like (collection_id, user_id, created_at) PK(collection_id,user_id)

user_collection_progress     -- Axis B (N/M)  -- projection from score events
  user_id, collection_id, filled_slots int, total_slots int, completed_at timestamptz null
  PK(user_id, collection_id)
user_region_progress         -- Axis A (%)    -- projection
  user_id, region_code, visited_count int, eligible_count int, percent numeric(5,2)
  PK(user_id, region_code)
```

Two axes are **independent tables**, both updated by the `visit.certified` consumer in `progress` — never computed ad hoc in a controller.

### 3.5 Challenges, policy, contests, social, misc

```
challenge       (id, level enum(REGION|THEME|SEASON|DOGAM|FOREIGN_BINGO), title,
                 criteria jsonb, reward_spec jsonb, region_code null, theme_tags null,
                 season null, active_from/to)
user_challenge_progress (user_id, challenge_id, progress int, target int, completed_at null)
policy_weight   (id, region_code null, context enum('GLOBAL'|'CERT'|'RANKING'|...),
                 weight numeric(4,2), effective_from, effective_to null)  -- FR17, Q3-safe
contest         (id, source, title, rules jsonb, opens_at, closes_at, status)
contest_submission (id, user_id, certification_id fk, contest_id fk,
                 spot_place_id, region_code, captured_at, theme_tags text[],
                 style text, license_scope enum(...),         -- FR29, Q1-config
                 consent_state int default 0,                  -- 0..4 staged (FR26)
                 status enum('DRAFT','SUBMITTED','SELECTED','WINNER','REJECTED'),
                 idempotency_key text, UNIQUE(user_id, idempotency_key))  -- FR30
hall_of_fame    (contest_submission_id pk, featured_at, rank)
agreement       (id, type enum('TOS','PRIVACY','CONTENT_LICENSE','OFFICIAL_CHANNEL','CONTEST'),
                 version int, locale, title, body_url, effective_from, is_current bool)
                 -- legal authors the text per version; UNIQUE(type, version)
user_agreement_acceptance  -- append-only audit of who accepted which version (Q1/Q5 legal basis)
                (id, user_id, agreement_id fk, accepted_at, ip null)
                 -- official-channel use / attribution / non-transfer license is GRANTED via
                 -- the accepted OFFICIAL_CHANNEL/CONTENT_LICENSE agreement version, not per-click
review          (id, user_id, spot_place_id, image_id null, body, keyword_tags text[],
                 moderation_status, created_at)
follow          (follower_id, followee_id) PK(both)
device_token    (id, user_id, platform enum('IOS','ANDROID'), token, last_seen_at)
audit_log       (id, actor_id, actor_role, action, target_type, target_id,
                 before jsonb, after jsonb, created_at)   -- append-only
event_outbox    (id, type, payload jsonb, status enum('PENDING','SENT','DEAD'),
                 attempts int, created_at, processed_at)   -- transactional outbox
```

### 3.6 Indexes / constraints checklist (drizzle-kit will NOT infer the spatial ones)
- **`CREATE EXTENSION IF NOT EXISTS postgis;`** and **`pg_trgm`** — raw, in the first migration.
- GIST: `place.coords`, `region.boundary`, `certification.device_point`.
- GIN: `place_i18n.search_tsv` (FTS), `pg_trgm` GIN on `place_i18n.name` (matcher).
- B-tree/unique: `certification(user_id, idempotency_key)` UNIQUE; partial unique accepted-visit per spot; `score_event.certification_id` UNIQUE; `place_external_ref` PK; `contest_submission(user_id, idempotency_key)` UNIQUE.
- Migrations: drizzle-kit generates the table DDL the team reviews; the spatial column types (`geometry(Point,4326)` via Drizzle `geometry`), the `CREATE EXTENSION`, all GIST/GIN DDL, the `search_tsv` generated-column expression, and partial unique indexes are added as **hand-authored raw SQL migration steps** that drizzle-kit cannot infer. See §7-Decision-B.

---

## 4. API / interface contracts

REST/JSON. All bodies validated by zod (drizzle-zod for entity-derived shapes). Auth via `Authorization: Bearer <jwt>`. Locale via `Accept-Language` → `RequestContext.locale` (KO default). Standard error envelope:
```json
{ "error": { "code": "STRING_CODE", "message": "human readable", "details": {} } }
```
Errors: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`/`IDEMPOTENT_REPLAY`, 422 `PROXIMITY_FAILED`/`MODERATION_REJECTED`, 429 `RATE_LIMITED`, 502 `UPSTREAM_AI_ERROR`.

Selected core endpoints (representative, not exhaustive):

### Auth (FR33)
- `POST /auth/register` → 201 `{userId}`; `POST /auth/login` → `{accessToken, refreshToken}`; `POST /auth/refresh`; `POST /auth/logout` (revokes refresh).

### Places & search (FR1–FR4)
- `GET /places/:id?locale=` → `PlaceDto{id, kind, name, description, address, coords, regionCode, locale}` (404).
- `GET /places/search?q=&locale=&region=` → FTS results `PlaceSummaryDto[]`.
- `GET /regions/:code/recommended` and `/regions/:code/unvisited` (FR4) → `PlaceSummaryDto[]`.

### Progress (FR5–FR6)
- `GET /me/progress/regions` → `RegionProgressDto[]{regionCode, percent, visited, eligible}` (Axis A map).
- `GET /me/progress/collections/:id` → `{filledSlots, totalSlots, completedAt}` (Axis B).

### Collections & feeds (FR6–FR9)
- `POST /collections` (USER) → create UGC; `PATCH /collections/:id`; `POST /collections/:id/slots`; `PATCH /collections/:id/slots/reorder`.
- `GET /collections/:id?locale=` → `CollectionDto{..., slots:[{placeId, name, filledByMe, label}], likeCount, owner}`.
- `POST /collections/:id/like` / `DELETE` (FR9).
- `GET /feeds/trending?window=WEEK` (FR9 이번 주 급상승) · `GET /feeds/newly-added`.

### Certification (FR10–FR14) — multipart
- `POST /certifications` (multipart: `image`, `deviceLat`, `deviceLng`, `deviceAccuracyM`, `clientCapturedAt`, `spotPlaceId`, `method`, header `Idempotency-Key`).
  - Server records device GPS itself from the authenticated request payload (PRIMARY); EXIF parsed async/advisory.
  - Sync response 202 `CertificationDto{id, status, proximityPass, proximityDistanceM}`; or 422 `PROXIMITY_FAILED` if outside tolerance (**[BLOCKED: Q4]** tolerance/GPS-poor behavior → config `proximityToleranceM` default 150, GPS-poor → `NEEDS_REVIEW` not hard reject).
  - Replay of same `Idempotency-Key` → 200 with original result (no double count).
- `GET /certifications/:id` → status incl. async `landmarkPass`, `moderationStatus`.
- `POST /certifications/qr` (FR12): `{stampCode, deviceLat, deviceLng}`.

### AI illustration (FR15)
- `POST /illustrations` `{imageId, style}` → 202 `{jobId}`; `GET /illustrations/:jobId` → status+resultImageId. One style per request.

### Challenges / rankings / discovery / reviews / social / notifications
- `GET /me/challenges` (FR16); `GET /rankings?scope=NATIONAL|REGION&region=` + `GET /me/rank?scope=` returns `{rank, percentileTop}` (FR21).
- `GET /discovery?tab=RANK|RECO|THEME|REGION&locale=` (FR18) → cards incl. `sunWindows{sunrise,sunset,goldenHourStart/End}` + `dDay` (FR19).
- `POST /reviews` (FR22) `{spotPlaceId, body, keywordTags[], imageId?}`.
- `POST /social/follow/:userId`, `GET /users/:id/dogam` (FR23).
- `POST /notifications/device-tokens` `{platform, token}` (FR24).

### Contest loop (FR25–FR31)
- `GET /me/contest-matches` (auto-matched, FR25).
- `POST /contest-submissions/:id/consent` `{step}` advances staged consent (FR26); server enforces ordered steps.
- `POST /contest-submissions` `{certificationId, contestId, themeTags, style, licenseScope}` header `Idempotency-Key` → requires `consent_state==4` AND `landmark_pass==true` AND `moderation==PASS`, else 422 with which gate failed (FR27,FR28,FR30).
- `GET /hall-of-fame` (FR31).

### Admin (FR32) — `RolesGuard(ADMIN|MODERATOR|CURATOR)`
- `GET/POST /admin/collections` (curate); `GET /admin/moderation/queue?type=PROACTIVE|REACTIVE`, `POST /admin/moderation/:imageId/decision`; `GET/PUT /admin/policy-weights` (every write → `audit_log`).

---

## 5. Data flow (primary scenarios)

### 5.1 TourAPI sync + canonical match (FR1–FR3, handoff #1)
`ingestion-sync` job → `TourApiPort.fetch(scope, locale)` → for each item normalize → `places.matchOrCreate(candidate)` → matcher (§3.1) attaches i18n + external_ref or creates new place → `geo.regionContaining` sets region → emits `place.matched`/`place.match.ambiguous`. Ambiguous → admin queue. FTS `search_tsv` populated by generated column on i18n insert.

### 5.2 Certification happy path (FR10–FR14, handoff #2+#3) — the central flow
```
1. Client POST /certifications (image + server-trusted device GPS + Idempotency-Key)
2. certification.service:
   a. UPSERT-guard on (user_id, idempotency_key); if exists → return prior result (FR13).
   b. Upload image to S3 (image-process queue makes variants); persist `image`(is_public=false).
   c. SYNC fast path: geo.spotsWithin / geo.distanceMeters(device_point, spot.coords)
        → proximity_pass = distance <= proximityToleranceM (PostGIS, ST_DWithin).
        region_code = geo.regionContaining(device_point).
      - proximity_pass=false → status=PROXIMITY_FAILED → 422 (no score). [Q4 config]
   d. Enqueue: moderation(imageId) [proactive, FR28] and verification(certId) [EXIF+landmark].
   e. status=ACCEPTED for the NORMAL path as soon as proximity passes
        (landmark advisory here; REQUIRED only for contest path FR27).
   f. Call scoring.applyCertification(certId)  ── SINGLE SOURCE OF TRUTH.
3. scoring.service (idempotent via score_event.certification_id UNIQUE + scored_at):
   base = base points for method/spot;
   weight = policy.weightFor(region_code, 'CERT');     // data-driven, FR17
   weighted = base * weight;
   INSERT score_event (same tx as setting certification.scored_at);
   write `visit.certified` to event_outbox (SAME TX) → returns.
4. outbox-relay worker publishes `visit.certified` to in-proc EventBus → fan-out consumers:
   - progress: update user_region_progress (Axis A) + user_collection_progress for every
     collection containing spot (collections.collectionsContaining) (Axis B). (FR5,FR6,FR14)
   - challenges: challenges.matchingChallenges → increment user_challenge_progress. (FR16,FR17)
   - rankings: ZINCRBY national + region ZSET by weighted_score. (FR21)
   - recommendations: invalidate user reco cache.
   - notifications: maybe enqueue policy/location push. (FR24)
   Each consumer is idempotent keyed by (consumer, score_event.id) → safe re-delivery (§6).
5. async moderation PASS → image.is_public=true (eligible for public/contest).
   async verification → certification.landmark_pass set (gates contest path only).
```

### 5.3 Certification state machine
```
PENDING ──proximity fail──> PROXIMITY_FAILED (terminal, no score)
   │ proximity pass
   ▼
ACCEPTED ──(normal path scored)            // landmark advisory
   │  GPS-poor / low accuracy → NEEDS_REVIEW (admin) [Q4]
   ▼
(moderation REJECTED at any time → image stays private; visit score may stand or be
 reversed per policy — reversal writes a compensating score_event, never deletes ledger)
```

### 5.4 Contest submission (FR25–FR31, handoff #3)
`autoMatch` (on `visit.certified`, eligibility = spot in a contest's scope) creates `contest_submission(status=DRAFT)`. User completes consent steps 1→4 (FR26, ordered, each logged to `audit_log`). `POST /contest-submissions` validates the three gates (consent==4, landmark_pass, moderation PASS) — only then `SUBMITTED`. Idempotent via `(user_id, idempotency_key)`. Selected/winner → `hall_of_fame`.

### 5.5 Discovery feed (FR18–FR19)
`DiscoveryService.feed(tab)`: RANK → rankings ZSET; RECO → recommendations (policy-weighted, clustered); THEME/REGION → collections/places by tag/region. Each card enriched by `SunTimeService.windowsFor(coords, today)` (suncalc) + D-day for festivals. Heavy feeds cached in Redis with short TTL.

---

## 6. Consistency & error handling

- **Single source of truth (handoff #2):** all score mutation flows through `scoring.applyCertification` → `score_event` ledger → one `visit.certified` event. No other module computes score. Rankings/progress/challenges are **projections**; they can be rebuilt by replaying `score_event` (reproducibility NFR).
- **Idempotency (FR13, FR30):**
  - HTTP layer: `Idempotency-Key` header → DB unique constraint; replay returns the stored prior response (200), never re-executes side effects.
  - Scoring: `score_event.certification_id` UNIQUE + `certification.scored_at` short-circuit → applying twice is a no-op.
  - Event consumers: each consumer records `(consumer_name, score_event_id)` processed-marker (small `event_consumption` table or Redis SET) → at-least-once delivery is safe; consumers are idempotent.
- **Transactions:** the score write + outbox insert happen in ONE PostgreSQL transaction (transactional outbox pattern) → no event is emitted unless the score persisted, and the score never persists without its event being durably queued. `outbox-relay` polls `event_outbox(status=PENDING)` and marks `SENT`; failures retried with backoff, exhausted → `DEAD` + alert.
- **Async failures / retries:** BullMQ jobs (ai-verify, illustrate, moderation, push, ingestion) use bounded retries + exponential backoff; exhausted → dead-letter (failed set) + admin-visible. AI port timeouts → `UPSTREAM_AI_ERROR`; landmark failure on normal path is non-fatal (advisory), on contest path blocks submission (FR27).
- **Failure modes table:**
  | Failure | Handling |
  |---|---|
  | Duplicate/retried cert submit | DB unique key → idempotent replay (FR13) |
  | GPS spoof via EXIF | EXIF untrusted/advisory; server device GPS is primary (FR11) |
  | GPS-poor environment | `NEEDS_REVIEW`, not hard reject [Q4 config] |
  | AI landmark provider down | normal path proceeds (advisory); contest submit blocked w/ clear error |
  | NSFW image | image.is_public stays false; never public/contest (FR28) |
  | Event consumer crash mid-fanout | at-least-once redelivery + idempotent consumer markers |
  | Multilingual id mismatch | coordinate+name fallback matcher; ambiguous → admin (handoff #1) |
  | Policy weight edited mid-flight | weight resolved at scoring time, stamped into score_event (auditable) |
- **Auditability (NFR):** consent steps, moderation decisions, policy edits, and reversals all write `audit_log`; the immutable `certification` + `score_event` rows are themselves an audit trail.

---

## 7. Key decisions & trade-offs

### Decision A — Canonical place identity model (handoff #1)
- **Options:** (1) one table with locale columns; (2) **canonical `place` + `place_i18n` rows + `place_external_ref`** (chosen); (3) one row per (provider,locale,contentId) with a join table.
- **Chosen (2)** because TourAPI contentIds are not guaranteed shared across KO/EN/JA/ZH (Risk #1) — identity must be language-neutral and provider-neutral, with refs as a many-to-one mapping and a coordinate+name fallback when contentIds diverge. (1) can't represent N external ids; (3) duplicates canonical truth and complicates the two-axis progress. Trade-off: matcher complexity + a periodic match pass, accepted because it is the project's #1 risk and isolated in one testable service.

### Decision B — Drizzle + PostGIS access strategy (central constraint)
- **Options:** Prisma (rejected — stack is fixed to Drizzle); Drizzle query-builder only (insufficient — no polygon/ST_* DSL); **Drizzle for relational + isolated `sql\`\`` typed fragments for all spatial ops, centralized in `geo` + spatial repository methods** (chosen).
- **Chosen** per the stated constraint. `geometry(Point,4326)` columns use Drizzle's `geometry` type; `ST_Contains`/`ST_DWithin`/`ST_Distance`/`ST_ClusterDBSCAN` live ONLY in `geo` behind typed methods. `geography` cast is used for accurate metric distance in proximity checks (`device_point::geography`, `spot.coords::geography`) while storage stays `geometry(...,4326)`. Migrations: drizzle-kit emits reviewable SQL for tables; **`CREATE EXTENSION postgis/pg_trgm`, all GIST/GIN indexes, the `search_tsv` generated column, and partial unique indexes are hand-written raw migration statements** appended to the generated migration (drizzle-kit cannot infer them). Trade-off: some SQL is unchecked by the query builder — mitigated by centralization + integration tests against a real PostGIS test DB.

### Decision C — Async + events: BullMQ + transactional outbox + in-proc EventBus
- **Options:** synchronous fan-out in request (rejected — couples scoring to ranking/notify latency & failures); direct BullMQ enqueue from service (rejected — not transactional with the DB write, can lose/duplicate events); **transactional outbox → relay → in-proc EventBus fan-out, with BullMQ for the genuinely external/slow work** (chosen).
- **Chosen** to guarantee the single-source event is emitted exactly when (and only when) the score commits, while keeping consumers decoupled and individually testable. Non-goal SQS respected (BullMQ only). Trade-off: outbox relay adds a small latency + a moving part; acceptable for correctness.

### Decision D — Trending/feeds: Redis ZSET + periodic PG snapshot (handoff #4)
- **Options:** compute trending by SQL aggregate on demand (rejected — expensive, not "instant"); Redis only (rejected — volatile, not reproducible); **Redis ZSET incremented on like events + a `trending-snapshot` job persisting ranked snapshots to PG** (chosen).
- **Chosen** so feeds are instant (Redis) yet reproducible/durable (snapshot) per NFR. Window semantics ("이번 주") **[BLOCKED: Q11]** → default rolling-7d ZSET with daily decay; calendar-week trivially swappable. Trade-off: eventual consistency for trending, explicitly acceptable per NFR.

---

## 8. Testing strategy

- **Unit (majority):** pure domain logic in isolation with mocked ports/repos.
  - `PlaceMatcher` (distance+name scoring; CJK normalization) — table-driven cases incl. ambiguous band.
  - `scoring` math (base × policy weight), `SunTimeService` (suncalc with injected `ClockService`), percentile math, consent step ordering, certification state machine transitions, idempotency guards.
- **Integration (against a real PostgreSQL+PostGIS test container):** the `geo` spatial repository (ST_Contains region match, ST_DWithin proximity, ST_ClusterDBSCAN), FTS queries, the matcher's `pg_trgm` similarity, all unique/partial-unique constraints, the transactional outbox commit semantics. This is where the Drizzle `sql\`\`` fragments are verified — they cannot be unit-tested meaningfully. Use Testcontainers with the `postgis/postgis` image + a seeded fixture of a handful of regions/spots.
- **Event-flow integration:** assert that one `visit.certified` correctly drives progress (both axes), challenges, and rankings projections, and that re-delivery is a no-op (consumer idempotency).
- **e2e (NestJS supertest):** the central journeys — register→login→certify (happy + proximity fail + idempotent replay), create UGC collection→certify→N/M advances, contest submission gate enforcement (all three gates), admin policy edit → next cert reflects new weight.
- **Contract tests for ports:** each AI/external port (`LandmarkVerifierPort`, `NsfwModeratorPort`, `StyleTransferPort`, `TourApiPort`, `RoutingPort`) has a fake adapter used in tests + a contract test the real adapter must satisfy — keeps providers pluggable (Q7).

---

## 9. Risks / open questions for security & coding stages

Blocked on product/legal (do NOT invent — config seams provided):
- **Q1 license model** → RESOLVED (core): creator retains ownership (no transfer), official use is an **attribution-required, non-transfer license**. `license_scope` enum should encode at least `ATTRIBUTION_REQUIRED` + non-exclusive/non-commercial defaults; attribution (creator handle) MUST be carried through to any official-asset/contest export. Remaining: commercial-use & revocability sub-points. **Security: this is the compliance-critical gate.**
- **Q3 declining-pop source/weight shape** → `policy_weight` supports per-region + global default; needs the authoritative list + cadence.
- **Q4 GPS tolerance + GPS-poor behavior** → `proximityToleranceM` config (default 150 m), GPS-poor → `NEEDS_REVIEW`. Tune with real data.
- **Q5 — RESOLVED:** `consent_state` steps = 1 in-app-public (low-res variant, in-app only) → 2 ops-review (in-app only) → 3 official-channel-posting (**external public starts here**, original + attribution) → 4 contest-submission. **Publish point = step 3.** In-app exposure (steps 1–2) serves a downscaled `image.variants` derivative; the original is reserved for the creator + official-asset/contest export and always carries creator attribution. Legal basis for step 3+ is a **versioned `agreement` (약관) acceptance** recorded in `user_agreement_acceptance`, not per-click legalese — legal authors the 약관 text per version.
- **Q6 moderation operating model** → queue supports auto/human/hybrid; SLA TBD.
- **Q7 AI providers** → all three are ports with fakes; pick providers + cost ceilings.
- **Q8 TourAPI quota/cadence** → config-driven schedule + rate-limited adapter.
- **Q11 trending window/formula/tie-break** → default rolling-7d ZSET; confirm.

Design-level risks for downstream stages:
- **PostGIS+Drizzle raw SQL** is the highest technical risk (Decision B). Recommend the §10 PoC before broad build-out.
- **Anti-fraud trust model** rests entirely on server-recorded app device GPS (FR10/11). Security stage must confirm the client cannot forge the GPS payload (e.g., device attestation, signed capture) — this design assumes the request payload device GPS is the trusted primary, which is only as trustworthy as the client/app integrity. **Flagged for security.**
- **PII / location traces & user photos** (NFR PII): retention posture, encryption at rest for `certification.device_lat/lng`, and image access control via signed CloudFront URLs — for security stage.
- **Idempotency correctness** across HTTP + scoring + consumers must be verified end to end (event-flow integration tests).
- **Image safety ordering:** `image.is_public` MUST default false and only flip on moderation PASS — a single missed check leaks unmoderated content (FR28). Security stage should add a defense-in-depth check at the serving layer.

## 10. Recommended de-risking PoC (before full build)
A 1–2 day spike proving the two load-bearing PostGIS paths end-to-end through Drizzle `sql\`\``:
1. Load a few `region` MultiPolygons + spots into `postgis/postgis`; verify `ST_Contains` region match and the GIST index plan.
2. Verify `ST_DWithin(device_point::geography, spot.coords::geography, tolerance)` proximity in the `geo` repository, exercised by the certification fast path.
3. Verify `pg_trgm` + `ST_DWithin` combined matcher scoring on a near-duplicate KO/EN pair.
If these pass cleanly, Decision B is validated and the rest is conventional NestJS.

---

## Handoff to security & coding

Build order suggestion: `platform` → `auth/users` → `geo` (+PoC §10) → `places/ingestion` → `certification` + `scoring` + outbox/EventBus → `progress`/`collections` → `challenges`/`rankings` → `discovery`/`suntime` → `contests`/`consent`/`moderation`/`verification` → `social`/`reviews`/`notifications` → `admin`/`audit`.

**Riskiest areas — review these hardest:**
1. **Certification trust / anti-fraud (FR10–FR11):** server device-GPS is the entire integrity story; confirm payload cannot be forged (client attestation) — security-critical.
2. **PostGIS via Drizzle `sql\`\`` + migrations (Decision B):** raw extension/GIST/generated-column/partial-unique DDL drizzle-kit won't infer; do the §10 PoC first.
3. **Single-source scoring + transactional outbox + idempotent consumers (handoff #2):** the correctness core; any divergence reintroduces double-counting / inconsistent scores.
4. **Image moderation ordering (FR28):** `is_public` default-false + PASS-only flip; one gap leaks unmoderated/NSFW content to public/contest.
5. **Canonical place matcher (handoff #1):** wrong thresholds merge distinct places or split one; isolate + test the ambiguous band, route to admin.
6. **Staged consent + license scope (FR26, Q1, Q5):** legal-gated; do not let content reach contest/public before consent_state==4 and the (TBD) eligibility step.

Design file: `/Users/afraca/Documents/Workspace/han-ddam/docs/pipeline/02-design.md`.
