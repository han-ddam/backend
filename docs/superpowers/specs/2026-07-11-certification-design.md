# 인증(Certification) 플로우 MVP — 설계 (2026-07-11)

## 목적

사진 + GPS로 여행지 방문을 **인증**하고, 검증 통과 시 **점수를 적립**하는 핵심 루프.
기존 `visit`(사진 없는 단순 수집)의 상위 개념. 실제 적립은 이 인증을 통해 일어난다.

## 범위 결정 (사용자 확정)

| 항목 | 결정 | 후속(비범위) |
|---|---|---|
| 사진 저장 | **미니PC 로컬 파일**(도커 볼륨) + StoragePort 추상화 | S3+CloudFront 전환 |
| 업로드 | **2단계**(업로드→imageKey→인증) | presigned |
| 검증 | **비동기 BullMQ** — 동기 GPS게이트 + 워커 VerifierPort(Mock) | AI 랜드마크/모더레이션/구도매칭 |
| 적립 | score_event 원장 + visit 기록 | EXP/레벨/랭킹 |
| 재인증 점수 | **장소당 처음 수집만** 적립 | — |
| GPS | **원본 미저장**, pass/distance만 | — |

## 정책 (중요)

- **위치정보법**: 디바이스 GPS 좌표는 요청 처리 중 근접판정에만 쓰고 **저장하지 않는다**.
  `certification`에는 위경도 컬럼이 없고 `proximity_pass`(통과여부) + `proximity_distance_m`(거리)만 남긴다.
  (04-data-sources.md "근접판정만, 원본 미저장" 방침 준수.) 실제 위치사업 신고 필요 여부는 법률 검토 대상.
- **점수 무결성(SSOT)**: 모든 점수는 `score_event` 원장에 기록. 랭킹/진행도는 이 원장의 프로젝션(재구성 가능).
- **첫 수집만 적립**: `(user, place)`당 score_event 1건. 재인증은 ACCEPTED되되 신규 점수 0.
- **멱등 3중**: ① `Idempotency-Key` 헤더(중복 제출) ② `score_event.certification_id UNIQUE`(워커 재시도) ③ `score_event UNIQUE(user,place)`(장소당 1회).
- **근접 반경**: 기존 `PROXIMITY_TOLERANCE_M` config 재사용(기본 150m). 장소별 커스텀은 후속.

## 데이터 모델 (마이그레이션 0012)

```sql
-- 인증 상태 enum
certification_status: PENDING | ACCEPTED | REJECTED
certification_visibility: PRIVATE | PUBLIC

certification
  id            uuid PK
  user_id       uuid NOT NULL FK users(id) ON DELETE CASCADE
  place_id      uuid NOT NULL FK place(id) ON DELETE CASCADE
  image_key     text NOT NULL              -- StoragePort가 반환한 키 (로컬 경로/후속 S3 키)
  caption       text
  visibility    certification_visibility NOT NULL DEFAULT 'PRIVATE'
  status        certification_status NOT NULL DEFAULT 'PENDING'
  proximity_pass boolean NOT NULL
  proximity_distance_m numeric              -- 좌표 아님, 거리만
  reject_reason text
  scored_at     timestamptz                 -- 적립 완료 시각(멱등 가드)
  created_at    timestamptz NOT NULL DEFAULT now()
  UNIQUE(user_id, image_key)                -- 같은 사진 재전송 방지
  INDEX(user_id)                            -- 내 인증 목록(후속)

score_event                                 -- 점수 원장 (SSOT)
  id            uuid PK
  user_id       uuid NOT NULL FK users(id) ON DELETE CASCADE
  place_id      uuid NOT NULL FK place(id) ON DELETE CASCADE
  certification_id uuid NOT NULL UNIQUE FK certification(id) ON DELETE CASCADE
  base_points   integer NOT NULL
  region_weight numeric(4,2) NOT NULL
  rarity_weight numeric(4,2) NOT NULL
  event_multiplier numeric(4,2) NOT NULL
  weighted_score numeric NOT NULL           -- 최종 점수(= ScoringService.preview.estimatedPoints)
  created_at    timestamptz NOT NULL DEFAULT now()
  UNIQUE(user_id, place_id)                 -- 장소당 1회 적립
```

- Drizzle 스키마: `src/db/schema/certifications.ts`, `score-events.ts`, `index.ts` export 추가.
- 기존 `visit`은 그대로. 인증 ACCEPTED 시 visit도 함께 기록(도감/진행도 반영). visit UNIQUE(user,place)로 멱등.

## API

전 엔드포인트 성공은 `{result:...}`만, 실패는 `{error:{code,message}}`만 (전역 인터셉터). `@ApiOperation` summary 포함.

### 1. `POST /api/me/certifications/photos` — 사진 업로드 (로그인)
- `multipart/form-data`, 필드 `file` (이미지 1개)
- 검증: MIME 화이트리스트(`image/jpeg|png|webp`), 최대 10MB, 매직바이트 확인
- StoragePort.save → 키 생성 `certifications/{uuid}.{ext}`, 디스크 저장
- 응답 201: `{ result: { imageKey: "certifications/{uuid}.jpg" } }`
- 위반 시 400 (타입/크기)

### 2. `POST /api/me/certifications` — 인증 제출 (로그인, `Idempotency-Key` 헤더)
```jsonc
// 요청 (JSON)
{ "placeId":"uuid", "imageKey":"certifications/abc.jpg",
  "deviceLat":33.4, "deviceLng":126.5,     // 근접판정용, 미저장
  "capturedAt":"2026-07-11T...",           // ISO, 참고용(선택)
  "caption":"일출!",                       // 선택 ≤500
  "visibility":"PUBLIC" }                  // 기본 PRIVATE
```
- 동기 처리:
  1. place 존재/ACTIVE 확인 (없으면 404 `Place not found`)
  2. imageKey 존재 확인 (StoragePort.exists; 없으면 400)
  3. **근접 게이트**: `geo.isWithin({lng,lat}device, place, 200)` + `geo.distanceMeters`로 거리
     - 실패 → cert `status=REJECTED, proximity_pass=false`, `reject_reason='OUT_OF_RANGE'` 저장, 큐 X
     - 통과 → cert `status=PENDING, proximity_pass=true` 저장 + `certification` 큐에 `{certId}` enqueue
- 응답 201: `{ result: { certId, status, proximityPass } }` (PENDING 또는 REJECTED)
- 중복 제출(Idempotency-Key 재사용) → 최초 결과 재반환

### 3. `GET /api/me/certifications/:id` — 인증 상태 조회 (본인만, 폴링)
```jsonc
{ "result": { "certId":"uuid", "status":"ACCEPTED", "placeId":"uuid",
    "awardedPoints": 22.5,          // 적립됐으면(첫 수집) score_event.weighted_score, 아니면 0
    "alreadyCollected": false,      // 이미 수집한 장소였으면 true
    "rejectReason": null } }
```
- 남의 인증 id → 404 (소유자 아님도 404로 통일, 존재 노출 방지)

### 4. `GET /api/certifications/photos/:key` — 사진 서빙
- StoragePort.read로 파일 스트리밍, 적절한 Content-Type
- **visibility 체크**: 해당 image_key의 cert가 `PRIVATE`면 본인(로그인)만, `PUBLIC`이면 게스트 포함 누구나
- 없는 키 → 404

## 모듈 구조 — `src/modules/certifications/`

기존 모듈 패턴(controller+service+repository+dto) + 포트 2개 + 워커 프로세서.

- **`storage/storage.port.ts`** (인터페이스): `save(buf, mime): Promise<{key}>`, `read(key): Promise<{stream, mime}>`, `exists(key): Promise<boolean>`.
  - **`storage/local-storage.ts`**: 볼륨 디렉터리(`STORAGE_DIR`, 기본 `/app/uploads`)에 읽고 씀.
- **`verify/verifier.port.ts`** (인터페이스): `verify(cert): Promise<{pass:boolean, reason?:string}>`.
  - **`verify/mock-verifier.ts`**: 항상 `{pass:true}`. (후속: LandmarkVerifier/ModerationVerifier/CompositionMatcher를 워커 검증 단계에 추가)
- **`certifications.repository.ts`**: cert CRUD, score_event insert(onConflictDoNothing), 첫수집 판정(score_event/visit 존재 확인), place 조회(좌표).
- **`certifications.service.ts`**: 업로드(StoragePort), 제출(근접게이트+enqueue), 조회.
- **`certifications.controller.ts`**: 4개 라우트. 업로드는 `@UseInterceptors(FileInterceptor('file'))`.
- **`certifications.processor.ts`**: `@Processor('certification')` — 워커에서 활성. VerifierPort.verify → 통과 시 트랜잭션(첫수집이면 visit+score_event, cert ACCEPTED+scored_at), 실패 시 REJECTED.
- **`certifications.module.ts`**: BullMQ 큐 등록 + AuthModule + ScoringModule(계산기) + GeoModule + PlatformModule(DRIZZLE/IdService). Local/Mock 구현체를 포트 토큰에 바인딩.

### 기반 인프라 (이 프로젝트 첫 BullMQ 사용)
- **`src/platform/queue/queue.module.ts`** 신규: `BullModule.forRootAsync`로 Redis(`REDIS_URL`) 연결. 전역(@Global) 또는 app.module 등록.
- `certifications.module`에서 `BullModule.registerQueue({ name: 'certification' })`.
- 워커(`src/worker.ts`)는 AppModule을 그대로 부팅하므로 프로세서가 자동 활성. 코드 변경 불필요.

### 인프라 파일
- **`compose.server.yml` / `docker-compose.yml`**: app·worker에 uploads 볼륨 마운트
  ```yaml
  volumes:
    - handdam-uploads:/app/uploads
  # + 최상위 volumes: 에 handdam-uploads:
  ```
- **`.env`**: `STORAGE_DIR=/app/uploads` (기본값 코드에도 둠)

## 비동기 흐름 (요약)

```
POST /me/certifications
  ① place/imageKey 확인 → 근접 게이트(200m)
       실패 → REJECTED 즉시 반환(큐 X)
       통과 → PENDING 저장 + 'certification' 큐 enqueue({certId})
  ② 201 {certId, PENDING}
── worker: @Processor('certification') ──
  ③ VerifierPort.verify(cert)   ← Mock(항상 pass), 후속 AI 삽입 지점
       실패 → REJECTED(reject_reason)
  ④ 통과 → 트랜잭션:
       첫 수집((user,place) score_event 없음)?
         예 → ScoringService.preview(placeId)로 점수 재료 조회 →
              visit 기록 + score_event 1건(preview 값 그대로 저장, weighted=estimatedPoints)
         아니오 → 적립 스킵
       (SSOT: 미리보기 GET /scoring/places/:id 와 실제 적립이 동일 함수·값)
       cert ACCEPTED + scored_at
  ⑤ 클라 GET /me/certifications/:id 로 결과 확인(폴링)
```

## 확장 지점 (비동기로 간 이유)

- **검증**: `VerifierPort`에 실제 AI 어댑터 추가 → 워커 ③단계에서 체이닝. API/모델/적립 불변.
- **저장**: `StoragePort`에 `S3Storage` 추가 + presigned 2단계로 전환 → 업로드 API만 교체.
- **적립 확장**: score_event는 EXP/레벨/랭킹의 원장. 후속에서 이 이벤트를 소비해 user_stat/랭킹 projection 추가(재구성 가능).

## 테스트

- **service 단위**(repo/port 모킹): 근접 통과→PENDING+enqueue / 실패→REJECTED / place부재→404 / imageKey부재→400.
- **processor 단위**: Mock pass→첫수집 시 visit+score_event, 재인증 시 스킵(멱등), Mock fail→REJECTED.
- **LocalStorage 단위**: save→키 반환, read 되읽기, MIME/크기 거부.
- **MockVerifier 단위**: 항상 pass.
- 멀티파트 업로드→인증→폴링 e2e는 수동 검증 + 후속.

## 비범위 (후속)

S3/presigned, AI 검증(랜드마크/모더레이션/구도), EXP/레벨/랭킹, 내 인증 목록(`GET /me/certifications`), 공개 피드, 신고/모더레이션 UI, 장소별 근접 반경, sharp 리사이즈/썸네일, QR 스탬프 변형.
