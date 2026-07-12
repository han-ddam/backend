# 인증(Certification) 플로우 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사진(로컬 저장) + GPS 근접판정으로 방문을 인증하고, 비동기(BullMQ) 검증 통과 시 점수(score_event)+수집(visit)을 적립하는 인증 플로우.

**Architecture:** `certifications` 모듈 신규. 업로드→인증 2단계. StoragePort(Local)·VerifierPort(Mock) 추상화로 S3/AI 확장 대비. 제출 시 동기 GPS 게이트(geo) 통과분만 `certification` BullMQ 큐에 넣고, 워커 프로세서가 검증→적립(ScoringService.preview 재사용, SSOT). 이 프로젝트 첫 BullMQ 사용.

**Tech Stack:** NestJS 11, Drizzle(PostgreSQL+PostGIS), @nestjs/bullmq+bullmq(ioredis), @nestjs/platform-express(FileInterceptor/multer), nestjs-zod, Jest. 스펙: `docs/superpowers/specs/2026-07-11-certification-design.md`

## Global Constraints

- **브랜치**: `feat/certification` (main 최신에서 생성). Co-Authored-By 트레일러 금지.
- **툴체인**: `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...`. `lint` 실행 금지(환경 문제).
- **응답 envelope**: 성공 `{result:...}`만 — 컨트롤러는 payload만 반환(전역 인터셉터).
- **정책(정확값)**:
  - GPS 좌표 **미저장** — `certification`엔 위경도 컬럼 없음, `proximity_pass`+`proximity_distance_m`만.
  - 점수 SSOT — 적립은 `ScoringService.preview(placeId)` 값을 `score_event`에 그대로 저장(weighted=estimatedPoints).
  - **첫 수집만 적립** — `(user,place)`당 score_event 1건. 재인증은 ACCEPTED되되 신규 점수 0.
  - 멱등 — `score_event UNIQUE(certification_id)`, `score_event UNIQUE(user_id,place_id)`, `certification UNIQUE(user_id,image_key)`(같은 사진 재제출 시 기존 cert 반환).
  - 근접 반경 — 기존 `PROXIMITY_TOLERANCE_M` config(기본 150m) 재사용.
  - 업로드 검증 — MIME `image/jpeg|png|webp`, 최대 10MB.
  - 사진 서빙 visibility — PRIVATE=본인만, PUBLIC=게스트 포함.
- **경로 별칭**: `@db/schema`, `@platform/...`, `@modules/...`.
- **재사용**: `ScoringService.preview(placeId): Promise<ScorePreview{action,basePoints,regionWeight,rarityWeight,eventMultiplier,estimatedPoints}>`(ScoringModule export), `GeoService.isWithin(point,target,meters)`/`distanceMeters(a,b)`(GeoModule export, `point={lng,lat}`), `IdService.generate()`/`ClockService.now()`(PlatformModule @Global). place 좌표: `place.lat/lng`(double).
- 현재 테스트 수 기준선 확인: 착수 전 `corepack pnpm test`로 통과 개수 파악(변동 가능). 각 태스크는 신규 테스트만 추가.

---

### Task 1: env(STORAGE_DIR) + 스키마 + 마이그레이션 0012

**Files:**
- Modify: `src/platform/config/env.ts`
- Create: `src/db/schema/certifications.ts`, `src/db/schema/score-events.ts`
- Modify: `src/db/schema/index.ts`
- Create(생성기): `src/db/migrations/0012_*.sql` + meta

**Interfaces:**
- Produces: Drizzle 테이블 `certifications`(certification), `scoreEvents`(score_event), enum `certStatusEnum`/`certVisibilityEnum`. env에 `STORAGE_DIR`. Task 5·6이 사용.

- [ ] **Step 1: 브랜치 생성**
```bash
git checkout main && git checkout -b feat/certification
```

- [ ] **Step 2: env에 STORAGE_DIR 추가**

`src/platform/config/env.ts`의 `envSchema` 객체에 `PROXIMITY_TOLERANCE_M` 줄 아래에 추가:
```ts
  // 인증 사진 로컬 저장 디렉터리 (도커 볼륨 마운트 지점).
  STORAGE_DIR: z.string().default('/app/uploads'),
```

- [ ] **Step 3: 스키마 파일 작성**

`src/db/schema/certifications.ts`:
```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  numeric,
  timestamp,
  unique,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';

export const certStatusEnum = pgEnum('certification_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
]);
export const certVisibilityEnum = pgEnum('certification_visibility', [
  'PRIVATE',
  'PUBLIC',
]);

/**
 * 방문 인증 기록. GPS 좌표는 저장하지 않고(위치정보법) 근접 통과여부/거리만 남긴다.
 * 실제 점수 적립은 score_event(원장)에서, 이 테이블은 인증 시도의 감사 기록.
 */
export const certifications = pgTable(
  'certification',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    imageKey: text('image_key').notNull(), // StoragePort가 반환한 키
    caption: text('caption'),
    visibility: certVisibilityEnum('visibility').notNull().default('PRIVATE'),
    status: certStatusEnum('status').notNull().default('PENDING'),
    proximityPass: boolean('proximity_pass').notNull(),
    proximityDistanceM: numeric('proximity_distance_m'), // 좌표 아님, 거리만
    rejectReason: text('reject_reason'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userImageUq: unique('cert_user_image_uq').on(t.userId, t.imageKey),
    userIdx: index('cert_user_idx').on(t.userId),
  }),
);

export type Certification = typeof certifications.$inferSelect;
```

`src/db/schema/score-events.ts`:
```ts
import { pgTable, uuid, integer, numeric, timestamp, unique } from 'drizzle-orm/pg-core';
import { users } from './users';
import { places } from './places';
import { certifications } from './certifications';

/**
 * 점수 원장(SSOT). 랭킹/진행도는 이 원장의 프로젝션. (user,place)당 1건 = 첫 수집만 적립.
 */
export const scoreEvents = pgTable(
  'score_event',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    certificationId: uuid('certification_id')
      .notNull()
      .references(() => certifications.id, { onDelete: 'cascade' }),
    basePoints: integer('base_points').notNull(),
    regionWeight: numeric('region_weight', { precision: 4, scale: 2 }).notNull(),
    rarityWeight: numeric('rarity_weight', { precision: 4, scale: 2 }).notNull(),
    eventMultiplier: numeric('event_multiplier', { precision: 4, scale: 2 }).notNull(),
    weightedScore: numeric('weighted_score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    certUq: unique('score_event_cert_uq').on(t.certificationId),
    userPlaceUq: unique('score_event_user_place_uq').on(t.userId, t.placeId),
  }),
);

export type ScoreEvent = typeof scoreEvents.$inferSelect;
```

`src/db/schema/index.ts` 끝에 추가:
```ts
export * from './certifications';
export * from './score-events';
```

- [ ] **Step 4: 마이그레이션 생성 + 빌드 + 적용**
```bash
corepack pnpm db:generate --name certification
corepack pnpm build
corepack pnpm db:migrate
```
Expected: `0012_certification.sql` 생성(enum 2개 + 테이블 2개 + FK/UNIQUE/INDEX), 빌드 성공, 적용 성공.

검증:
```bash
docker exec handdam-postgres psql -U $(docker exec handdam-postgres printenv POSTGRES_USER) -d $(docker exec handdam-postgres printenv POSTGRES_DB) -c "\d certification" | grep -E "proximity|image_key|status"
```
Expected: image_key, status, proximity_pass, proximity_distance_m 존재 (위경도 컬럼 없음).

- [ ] **Step 5: 커밋**
```bash
git add src/platform/config/env.ts src/db/schema/ src/db/migrations/
git commit -m "feat(db): certification + score_event tables (no GPS stored, SSOT ledger)"
```

---

### Task 2: StoragePort + LocalStorage (TDD)

**Files:**
- Create: `src/modules/certifications/storage/storage.port.ts`
- Create: `src/modules/certifications/storage/local-storage.ts`
- Test: `src/modules/certifications/storage/local-storage.spec.ts`

**Interfaces:**
- Consumes: `IdService.generate()`, `ConfigService<Env,true>.get('STORAGE_DIR')`.
- Produces:
```ts
export const STORAGE: symbol; // DI 토큰
export interface StoragePort {
  save(buffer: Buffer, mime: string): Promise<{ key: string }>;
  read(key: string): Promise<{ stream: Readable; mime: string } | null>;
  exists(key: string): Promise<boolean>;
}
export const MIME_EXT: Record<string, string>; // { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }
```
Task 5 서비스가 `STORAGE` 토큰으로 주입받아 `save`/`exists`, Task 7 컨트롤러가 `read`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/modules/certifications/storage/local-storage.spec.ts`:
```ts
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorage } from './local-storage';

function make(dir: string) {
  let n = 0;
  const id = { generate: () => `id-${++n}` } as any;
  const config = { get: () => dir } as any; // STORAGE_DIR
  return new LocalStorage(config, id);
}

describe('LocalStorage', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'handdam-store-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('saves a buffer and returns a certifications/<id>.<ext> key', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('abc'), 'image/jpeg');
    expect(key).toBe('certifications/id-1.jpg');
    expect(existsSync(join(dir, key))).toBe(true);
  });

  it('exists() reflects saved keys', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('abc'), 'image/png');
    expect(await store.exists(key)).toBe(true);
    expect(await store.exists('certifications/nope.png')).toBe(false);
  });

  it('read() returns a stream + mime for a saved key, null for missing', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('hello'), 'image/webp');
    const got = await store.read(key);
    expect(got?.mime).toBe('image/webp');
    const chunks: Buffer[] = [];
    for await (const c of got!.stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(await store.read('certifications/missing.jpg')).toBeNull();
  });

  it('rejects an unsupported mime on save', async () => {
    const store = make(dir);
    await expect(store.save(Buffer.from('x'), 'image/gif')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- local-storage`
Expected: FAIL — `Cannot find module './local-storage'`

- [ ] **Step 3: port 작성**

`src/modules/certifications/storage/storage.port.ts`:
```ts
import type { Readable } from 'node:stream';

/** 인증 사진 저장 추상화. LocalStorage(지금) ↔ S3Storage(후속) 교체 지점. */
export const STORAGE = Symbol('STORAGE');

export interface StoragePort {
  /** 이미지 버퍼 저장 → 접근 키 반환. 미지원 mime이면 throw. */
  save(buffer: Buffer, mime: string): Promise<{ key: string }>;
  /** 키로 읽기(스트림+mime). 없으면 null. */
  read(key: string): Promise<{ stream: Readable; mime: string } | null>;
  exists(key: string): Promise<boolean>;
}

export const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
```

- [ ] **Step 4: LocalStorage 구현**

`src/modules/certifications/storage/local-storage.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { Readable } from 'node:stream';
import type { Env } from '@platform/config/env';
import { IdService } from '@platform/id/id.service';
import { StoragePort, MIME_EXT, EXT_MIME } from './storage.port';

/** 미니PC 로컬 디스크(STORAGE_DIR) 기반 저장소. 키는 certifications/<id>.<ext>. */
@Injectable()
export class LocalStorage implements StoragePort {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly id: IdService,
  ) {}

  private get root(): string {
    return this.config.get('STORAGE_DIR', { infer: true });
  }

  async save(buffer: Buffer, mime: string): Promise<{ key: string }> {
    const ext = MIME_EXT[mime];
    if (!ext) throw new Error(`unsupported mime: ${mime}`);
    const key = `certifications/${this.id.generate()}.${ext}`;
    const full = join(this.root, key);
    await mkdir(join(this.root, 'certifications'), { recursive: true });
    await writeFile(full, buffer);
    return { key };
  }

  async read(key: string): Promise<{ stream: Readable; mime: string } | null> {
    if (!(await this.exists(key))) return null;
    const ext = extname(key).slice(1);
    const mime = EXT_MIME[ext] ?? 'application/octet-stream';
    return { stream: createReadStream(join(this.root, key)), mime };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(join(this.root, key));
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `corepack pnpm test -- local-storage`
Expected: PASS 4/4

- [ ] **Step 6: 커밋**
```bash
git add src/modules/certifications/storage/
git commit -m "feat(certifications): StoragePort + local-disk implementation"
```

---

### Task 3: VerifierPort + MockVerifier (TDD)

**Files:**
- Create: `src/modules/certifications/verify/verifier.port.ts`
- Create: `src/modules/certifications/verify/mock-verifier.ts`
- Test: `src/modules/certifications/verify/mock-verifier.spec.ts`

**Interfaces:**
- Produces:
```ts
export const VERIFIER: symbol;
export interface VerifyInput { id: string; placeId: string; imageKey: string; }
export interface VerifierPort { verify(cert: VerifyInput): Promise<{ pass: boolean; reason?: string }>; }
```
Task 6 프로세서가 `VERIFIER` 토큰으로 주입받아 `verify`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/modules/certifications/verify/mock-verifier.spec.ts`:
```ts
import { MockVerifier } from './mock-verifier';

describe('MockVerifier', () => {
  it('always passes (MVP stub — real AI verifiers slot in later)', async () => {
    const v = new MockVerifier();
    const out = await v.verify({ id: 'c1', placeId: 'p1', imageKey: 'k' });
    expect(out).toEqual({ pass: true });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- mock-verifier`
Expected: FAIL — `Cannot find module './mock-verifier'`

- [ ] **Step 3: 구현**

`src/modules/certifications/verify/verifier.port.ts`:
```ts
/** 인증 검증 추상화. Mock(지금) ↔ AI 랜드마크/모더레이션/구도(후속) 교체·체이닝 지점. */
export const VERIFIER = Symbol('VERIFIER');

export interface VerifyInput {
  id: string;
  placeId: string;
  imageKey: string;
}

export interface VerifierPort {
  verify(cert: VerifyInput): Promise<{ pass: boolean; reason?: string }>;
}
```

`src/modules/certifications/verify/mock-verifier.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { VerifierPort, VerifyInput } from './verifier.port';

/** MVP: 항상 통과. 후속에서 실제 AI 검증기로 교체/체이닝. */
@Injectable()
export class MockVerifier implements VerifierPort {
  async verify(_cert: VerifyInput): Promise<{ pass: boolean; reason?: string }> {
    return { pass: true };
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `corepack pnpm test -- mock-verifier`
Expected: PASS 1/1

- [ ] **Step 5: 커밋**
```bash
git add src/modules/certifications/verify/
git commit -m "feat(certifications): VerifierPort + mock verifier (always-pass MVP)"
```

---

### Task 4: BullMQ 루트 인프라 (queue.module) + app.module

**Files:**
- Create: `src/platform/queue/queue.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces: 전역 BullMQ 루트 연결(Redis). Task 5의 `certifications.module`이 `BullModule.registerQueue({name:'certification'})`로 큐 등록, 서비스가 `@InjectQueue('certification')` 주입.

- [ ] **Step 1: queue.module 작성**

`src/platform/queue/queue.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@platform/config/env';

/**
 * BullMQ 루트 연결(Redis). REDIS_URL을 ioredis 연결 옵션으로 파싱.
 * 개별 큐는 각 도메인 모듈에서 registerQueue로 등록한다.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            // BullMQ 요구사항 (RedisModule과 동일)
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

- [ ] **Step 2: app.module에 등록**

`src/app.module.ts`:
- import 추가: `import { QueueModule } from '@platform/queue/queue.module';`
- imports 배열에서 `PlatformModule` 아래에 `QueueModule,` 추가.

- [ ] **Step 3: 빌드 + 부팅 확인**

Run: `corepack pnpm build`
Expected: 성공.

Run(로컬 인프라 필요 — redis 떠 있어야 함):
```bash
corepack pnpm test 2>&1 | tail -3
```
Expected: 기존 스위트 그대로 통과(신규 테스트 없음, BullMQ 루트가 기존 부팅을 깨지 않음).

- [ ] **Step 4: 커밋**
```bash
git add src/platform/queue/queue.module.ts src/app.module.ts
git commit -m "feat(platform): BullMQ root queue module (Redis connection)"
```

---

### Task 5: Repository + Service + Module (업로드/제출/조회, TDD)

**Files:**
- Create: `src/modules/certifications/dto/certification.dto.ts`
- Create: `src/modules/certifications/certifications.repository.ts`
- Create: `src/modules/certifications/certifications.service.ts`
- Create: `src/modules/certifications/certifications.module.ts`
- Test: `src/modules/certifications/certifications.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 스키마, Task 2 `STORAGE`/`StoragePort`, `GeoService`, `ScoringService`(Task 6에서 프로세서가 사용하지만 모듈 import는 여기서), `IdService`, `ClockService`, `@InjectQueue('certification')`.
- Produces:
```ts
// repository
placeCoords(placeId): Promise<{ lat: number; lng: number } | null>  // ACTIVE + 좌표 있음, 아니면 null
findByUserImageKey(userId, imageKey): Promise<{ id: string; status: string; proximityPass: boolean } | null>
createPending(p: {id,userId,placeId,imageKey,caption,visibility,distanceM}): Promise<void>
createRejected(p: {id,userId,placeId,imageKey,caption,visibility,distanceM,reason}): Promise<void>
findById(id): Promise<Certification | null>                          // 프로세서(Task6)용
reject(id, reason): Promise<void>                                    // 프로세서용
applyAccrual(p: {certId,userId,placeId,preview}): Promise<{awarded:boolean; weightedScore:number}> // 프로세서용
getResult(id, userId): Promise<{ certId,status,placeId,awardedPoints,alreadyCollected,rejectReason } | null>
// service
uploadPhoto(buffer: Buffer, mime: string): Promise<{ imageKey: string }>
submit(userId, dto: SubmitCertDto): Promise<{ certId; status; proximityPass }>
getCertification(userId, id): Promise<{...getResult 형태...}>  // 없으면 NotFound
```
Task 6 프로세서가 `findById`/`reject`/`applyAccrual`+`ScoringService`, Task 7 컨트롤러가 서비스+`STORAGE.read` 사용.

- [ ] **Step 1: 실패하는 서비스 테스트 작성** (repo/geo/storage/queue/scoring 모킹 — visits.service.spec 스타일)

`src/modules/certifications/certifications.service.spec.ts`:
```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificationsService } from './certifications.service';

describe('CertificationsService', () => {
  let repo: any, geo: any, storage: any, queue: any, id: any;
  let service: CertificationsService;

  beforeEach(() => {
    repo = {
      placeCoords: jest.fn(),
      findByUserImageKey: jest.fn(),
      createPending: jest.fn(),
      createRejected: jest.fn(),
      getResult: jest.fn(),
    };
    geo = { isWithin: jest.fn(), distanceMeters: jest.fn() };
    storage = { save: jest.fn(), exists: jest.fn() };
    queue = { add: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `cert-${++n}`) };
    const config = { get: () => 150 } as any; // PROXIMITY_TOLERANCE_M
    service = new CertificationsService(repo, geo, storage, queue, id, config);
  });

  const dto = {
    placeId: 'p1',
    imageKey: 'certifications/a.jpg',
    deviceLat: 33.4,
    deviceLng: 126.5,
    caption: 'x',
    visibility: 'PUBLIC' as const,
  };

  it('uploadPhoto stores the buffer and returns the key', async () => {
    storage.save.mockResolvedValue({ key: 'certifications/a.jpg' });
    const out = await service.uploadPhoto(Buffer.from('x'), 'image/jpeg');
    expect(out).toEqual({ imageKey: 'certifications/a.jpg' });
  });

  it('submit within range → PENDING and enqueues the cert', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue({ lat: 33.4001, lng: 126.5001 });
    storage.exists.mockResolvedValue(true);
    geo.isWithin.mockResolvedValue(true);
    geo.distanceMeters.mockResolvedValue(12.3);
    const out = await service.submit('u1', dto);
    expect(geo.isWithin).toHaveBeenCalledWith(
      { lng: 126.5, lat: 33.4 },
      { lng: 126.5001, lat: 33.4001 },
      150,
    );
    expect(repo.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cert-1', userId: 'u1', placeId: 'p1', distanceM: 12.3 }),
    );
    expect(queue.add).toHaveBeenCalledWith('verify', { certId: 'cert-1' });
    expect(out).toEqual({ certId: 'cert-1', status: 'PENDING', proximityPass: true });
  });

  it('submit out of range → REJECTED, no enqueue', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue({ lat: 40, lng: 130 });
    storage.exists.mockResolvedValue(true);
    geo.isWithin.mockResolvedValue(false);
    geo.distanceMeters.mockResolvedValue(999999);
    const out = await service.submit('u1', dto);
    expect(repo.createRejected).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cert-1', reason: 'OUT_OF_RANGE', distanceM: 999999 }),
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(out).toEqual({ certId: 'cert-1', status: 'REJECTED', proximityPass: false });
  });

  it('submit is idempotent — returns existing cert for same (user,imageKey)', async () => {
    repo.findByUserImageKey.mockResolvedValue({
      id: 'old',
      status: 'PENDING',
      proximityPass: true,
    });
    const out = await service.submit('u1', dto);
    expect(out).toEqual({ certId: 'old', status: 'PENDING', proximityPass: true });
    expect(repo.createPending).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('submit throws NotFound when place missing/hidden/no-coords', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue(null);
    await expect(service.submit('u1', dto)).rejects.toThrow(NotFoundException);
  });

  it('submit throws BadRequest when imageKey not uploaded', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue({ lat: 33.4, lng: 126.5 });
    storage.exists.mockResolvedValue(false);
    await expect(service.submit('u1', dto)).rejects.toThrow(BadRequestException);
  });

  it('getCertification throws NotFound when not owned/missing', async () => {
    repo.getResult.mockResolvedValue(null);
    await expect(service.getCertification('u1', 'nope')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- certifications.service`
Expected: FAIL — `Cannot find module './certifications.service'`

- [ ] **Step 3: DTO 작성**

`src/modules/certifications/dto/certification.dto.ts`:
```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class SubmitCertificationDto extends createZodDto(
  z.object({
    placeId: z.string().uuid().describe('여행지 UUID'),
    imageKey: z.string().min(1).describe('업로드 응답의 imageKey'),
    deviceLat: z.number().min(33).max(39).describe('촬영 위도(근접판정용, 미저장)'),
    deviceLng: z.number().min(124).max(132).describe('촬영 경도(근접판정용, 미저장)'),
    capturedAt: z.string().datetime().optional().describe('촬영 시각(ISO, 참고용)'),
    caption: z.string().max(500).optional().describe('한 줄 기록(선택)'),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE').describe('공개 설정'),
  }),
) {}
```

- [ ] **Step 4: Repository 작성**

`src/modules/certifications/certifications.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { IdService } from '@platform/id/id.service';
import { ClockService } from '@platform/clock/clock.service';
import { certifications, scoreEvents, visits, places, type Certification } from '@db/schema';
import type { ScorePreview } from '@modules/scoring/score-calculator';

interface CreateInput {
  id: string;
  userId: string;
  placeId: string;
  imageKey: string;
  caption?: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  distanceM: number;
}

@Injectable()
export class CertificationsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly id: IdService,
    private readonly clock: ClockService,
  ) {}

  /** ACTIVE + 좌표 보유 place의 좌표, 아니면 null. */
  async placeCoords(placeId: string): Promise<{ lat: number; lng: number } | null> {
    const [row] = await this.db
      .select({ lat: places.lat, lng: places.lng })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    if (!row || row.lat === null || row.lng === null) return null;
    return { lat: row.lat, lng: row.lng };
  }

  async findByUserImageKey(
    userId: string,
    imageKey: string,
  ): Promise<{ id: string; status: string; proximityPass: boolean } | null> {
    const [row] = await this.db
      .select({ id: certifications.id, status: certifications.status, proximityPass: certifications.proximityPass })
      .from(certifications)
      .where(and(eq(certifications.userId, userId), eq(certifications.imageKey, imageKey)));
    return row ?? null;
  }

  async createPending(p: CreateInput): Promise<void> {
    await this.db.insert(certifications).values({
      id: p.id,
      userId: p.userId,
      placeId: p.placeId,
      imageKey: p.imageKey,
      caption: p.caption ?? null,
      visibility: p.visibility,
      status: 'PENDING',
      proximityPass: true,
      proximityDistanceM: p.distanceM.toString(),
    });
  }

  async createRejected(p: CreateInput & { reason: string }): Promise<void> {
    await this.db.insert(certifications).values({
      id: p.id,
      userId: p.userId,
      placeId: p.placeId,
      imageKey: p.imageKey,
      caption: p.caption ?? null,
      visibility: p.visibility,
      status: 'REJECTED',
      proximityPass: false,
      proximityDistanceM: p.distanceM.toString(),
      rejectReason: p.reason,
    });
  }

  async findById(id: string): Promise<Certification | null> {
    const [row] = await this.db.select().from(certifications).where(eq(certifications.id, id));
    return row ?? null;
  }

  async reject(id: string, reason: string): Promise<void> {
    await this.db
      .update(certifications)
      .set({ status: 'REJECTED', rejectReason: reason })
      .where(eq(certifications.id, id));
  }

  /** 검증 통과분 적립 — 첫 수집이면 score_event+visit 생성, 아니면 스킵. cert ACCEPTED. */
  async applyAccrual(p: {
    certId: string;
    userId: string;
    placeId: string;
    preview: ScorePreview;
  }): Promise<{ awarded: boolean; weightedScore: number }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: scoreEvents.id })
        .from(scoreEvents)
        .where(and(eq(scoreEvents.userId, p.userId), eq(scoreEvents.placeId, p.placeId)));

      let awarded = false;
      if (!existing) {
        const inserted = await tx
          .insert(scoreEvents)
          .values({
            id: this.id.generate(),
            userId: p.userId,
            placeId: p.placeId,
            certificationId: p.certId,
            basePoints: p.preview.basePoints,
            regionWeight: p.preview.regionWeight.toFixed(2),
            rarityWeight: p.preview.rarityWeight.toFixed(2),
            eventMultiplier: p.preview.eventMultiplier.toFixed(2),
            weightedScore: p.preview.estimatedPoints.toString(),
          })
          .onConflictDoNothing({ target: [scoreEvents.userId, scoreEvents.placeId] })
          .returning({ id: scoreEvents.id });
        if (inserted.length > 0) {
          awarded = true;
          await tx
            .insert(visits)
            .values({ id: this.id.generate(), userId: p.userId, placeId: p.placeId })
            .onConflictDoNothing({ target: [visits.userId, visits.placeId] });
        }
      }
      await tx
        .update(certifications)
        .set({ status: 'ACCEPTED', scoredAt: this.clock.now() })
        .where(eq(certifications.id, p.certId));
      return { awarded, weightedScore: awarded ? p.preview.estimatedPoints : 0 };
    });
  }

  /** GET 응답용 — cert + (있으면) score_event.weighted_score. 소유자 아니면 null. */
  async getResult(
    id: string,
    userId: string,
  ): Promise<{
    certId: string;
    status: string;
    placeId: string;
    awardedPoints: number;
    alreadyCollected: boolean;
    rejectReason: string | null;
  } | null> {
    const [cert] = await this.db
      .select()
      .from(certifications)
      .where(and(eq(certifications.id, id), eq(certifications.userId, userId)));
    if (!cert) return null;
    const [ev] = await this.db
      .select({ weighted: scoreEvents.weightedScore })
      .from(scoreEvents)
      .where(eq(scoreEvents.certificationId, id));
    // 이 cert가 적립원(=score_event 있음)인가 / 이미 수집(ACCEPTED인데 이 cert엔 event 없음)인가
    const [collected] = await this.db
      .select({ id: scoreEvents.id })
      .from(scoreEvents)
      .where(and(eq(scoreEvents.userId, userId), eq(scoreEvents.placeId, cert.placeId)));
    return {
      certId: cert.id,
      status: cert.status,
      placeId: cert.placeId,
      awardedPoints: ev ? Number(ev.weighted) : 0,
      alreadyCollected: cert.status === 'ACCEPTED' && !ev && !!collected,
      rejectReason: cert.rejectReason,
    };
  }
}
```

- [ ] **Step 5: Service 작성**

`src/modules/certifications/certifications.service.ts`:
```ts
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Env } from '@platform/config/env';
import { IdService } from '@platform/id/id.service';
import { GeoService } from '@modules/geo/geo.service';
import { CertificationsRepository } from './certifications.repository';
import { STORAGE, type StoragePort } from './storage/storage.port';
import { SubmitCertificationDto } from './dto/certification.dto';

export interface SubmitResult {
  certId: string;
  status: 'PENDING' | 'REJECTED';
  proximityPass: boolean;
}

@Injectable()
export class CertificationsService {
  constructor(
    private readonly repo: CertificationsRepository,
    private readonly geo: GeoService,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @InjectQueue('certification') private readonly queue: Queue,
    private readonly id: IdService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async uploadPhoto(buffer: Buffer, mime: string): Promise<{ imageKey: string }> {
    const { key } = await this.storage.save(buffer, mime);
    return { imageKey: key };
  }

  async submit(userId: string, dto: SubmitCertificationDto): Promise<SubmitResult> {
    // 멱등: 같은 (user,imageKey)면 기존 결과 반환
    const existing = await this.repo.findByUserImageKey(userId, dto.imageKey);
    if (existing) {
      return {
        certId: existing.id,
        status: existing.status as 'PENDING' | 'REJECTED',
        proximityPass: existing.proximityPass,
      };
    }
    const coords = await this.repo.placeCoords(dto.placeId);
    if (!coords) throw new NotFoundException('Place not found');
    if (!(await this.storage.exists(dto.imageKey))) {
      throw new BadRequestException('imageKey not found');
    }

    const device = { lng: dto.deviceLng, lat: dto.deviceLat };
    const target = { lng: coords.lng, lat: coords.lat };
    const radius = this.config.get('PROXIMITY_TOLERANCE_M', { infer: true });
    const distanceM = await this.geo.distanceMeters(device, target);
    const within = await this.geo.isWithin(device, target, radius);

    const certId = this.id.generate();
    const base = {
      id: certId,
      userId,
      placeId: dto.placeId,
      imageKey: dto.imageKey,
      caption: dto.caption,
      visibility: dto.visibility,
      distanceM,
    };
    if (!within) {
      await this.repo.createRejected({ ...base, reason: 'OUT_OF_RANGE' });
      return { certId, status: 'REJECTED', proximityPass: false };
    }
    await this.repo.createPending(base);
    await this.queue.add('verify', { certId });
    return { certId, status: 'PENDING', proximityPass: true };
  }

  async getCertification(userId: string, id: string) {
    const result = await this.repo.getResult(id, userId);
    if (!result) throw new NotFoundException('Certification not found');
    return result;
  }
}
```

- [ ] **Step 6: Module 작성** (프로세서/컨트롤러는 Task 6·7에서 추가)

`src/modules/certifications/certifications.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '@modules/auth/auth.module';
import { GeoModule } from '@modules/geo/geo.module';
import { ScoringModule } from '@modules/scoring/scoring.module';
import { CertificationsRepository } from './certifications.repository';
import { CertificationsService } from './certifications.service';
import { STORAGE } from './storage/storage.port';
import { LocalStorage } from './storage/local-storage';
import { VERIFIER } from './verify/verifier.port';
import { MockVerifier } from './verify/mock-verifier';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'certification' }),
    AuthModule, // JwtAuthGuard
    GeoModule, // 근접판정
    ScoringModule, // 적립 점수(preview) — 프로세서(Task6)에서 사용
  ],
  providers: [
    CertificationsRepository,
    CertificationsService,
    { provide: STORAGE, useClass: LocalStorage },
    { provide: VERIFIER, useClass: MockVerifier },
  ],
  exports: [CertificationsService],
})
export class CertificationsModule {}
```

- [ ] **Step 7: GREEN + 전체 + 빌드**

Run: `corepack pnpm test -- certifications.service` → PASS 7/7
Run: `corepack pnpm test && corepack pnpm build` → 전체 통과 + 빌드 성공.

- [ ] **Step 8: 커밋**
```bash
git add src/modules/certifications/
git commit -m "feat(certifications): upload/submit/get service + proximity gate + enqueue"
```

---

### Task 6: 워커 프로세서 (검증→적립, TDD)

**Files:**
- Create: `src/modules/certifications/certifications.processor.ts`
- Modify: `src/modules/certifications/certifications.module.ts` (providers에 프로세서 추가)
- Test: `src/modules/certifications/certifications.processor.spec.ts`

**Interfaces:**
- Consumes: Task 5 repo(`findById`/`reject`/`applyAccrual`), Task 3 `VERIFIER`/`VerifierPort`, `ScoringService.preview`.
- Produces: `@Processor('certification')` — 워커에서 `certification` 큐 job 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/modules/certifications/certifications.processor.spec.ts`:
```ts
import { CertificationsProcessor } from './certifications.processor';

describe('CertificationsProcessor', () => {
  let repo: any, verifier: any, scoring: any;
  let proc: CertificationsProcessor;

  beforeEach(() => {
    repo = { findById: jest.fn(), reject: jest.fn(), applyAccrual: jest.fn() };
    verifier = { verify: jest.fn() };
    scoring = { preview: jest.fn() };
    proc = new CertificationsProcessor(repo, verifier, scoring);
  });

  const job = (certId: string) => ({ data: { certId } }) as any;
  const pending = { id: 'c1', userId: 'u1', placeId: 'p1', imageKey: 'k', status: 'PENDING', scoredAt: null };

  it('verified first collection → applies accrual (visit + score_event)', async () => {
    repo.findById.mockResolvedValue(pending);
    verifier.verify.mockResolvedValue({ pass: true });
    scoring.preview.mockResolvedValue({
      action: 'CERT_PHOTO',
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1,
      eventMultiplier: 1,
      estimatedPoints: 22.5,
    });
    repo.applyAccrual.mockResolvedValue({ awarded: true, weightedScore: 22.5 });
    await proc.process(job('c1'));
    expect(scoring.preview).toHaveBeenCalledWith('p1');
    expect(repo.applyAccrual).toHaveBeenCalledWith({
      certId: 'c1',
      userId: 'u1',
      placeId: 'p1',
      preview: expect.objectContaining({ estimatedPoints: 22.5 }),
    });
    expect(repo.reject).not.toHaveBeenCalled();
  });

  it('verification fails → rejects with reason, no accrual', async () => {
    repo.findById.mockResolvedValue(pending);
    verifier.verify.mockResolvedValue({ pass: false, reason: 'NOT_LANDMARK' });
    await proc.process(job('c1'));
    expect(repo.reject).toHaveBeenCalledWith('c1', 'NOT_LANDMARK');
    expect(repo.applyAccrual).not.toHaveBeenCalled();
  });

  it('skips when cert missing or not PENDING or already scored (idempotent)', async () => {
    repo.findById.mockResolvedValue({ ...pending, status: 'ACCEPTED', scoredAt: new Date() });
    await proc.process(job('c1'));
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(repo.applyAccrual).not.toHaveBeenCalled();

    repo.findById.mockResolvedValue(null);
    await proc.process(job('c2'));
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- certifications.processor`
Expected: FAIL — `Cannot find module './certifications.processor'`

- [ ] **Step 3: 프로세서 구현**

`src/modules/certifications/certifications.processor.ts`:
```ts
import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ScoringService } from '@modules/scoring/scoring.service';
import { CertificationsRepository } from './certifications.repository';
import { VERIFIER, type VerifierPort } from './verify/verifier.port';

/** 'certification' 큐 소비 — 검증(VerifierPort) → 통과 시 적립(첫 수집만). 워커에서 활성. */
@Processor('certification')
export class CertificationsProcessor extends WorkerHost {
  constructor(
    private readonly repo: CertificationsRepository,
    @Inject(VERIFIER) private readonly verifier: VerifierPort,
    private readonly scoring: ScoringService,
  ) {
    super();
  }

  async process(job: Job<{ certId: string }>): Promise<void> {
    const cert = await this.repo.findById(job.data.certId);
    if (!cert || cert.status !== 'PENDING' || cert.scoredAt) return; // 멱등

    const result = await this.verifier.verify({
      id: cert.id,
      placeId: cert.placeId,
      imageKey: cert.imageKey,
    });
    if (!result.pass) {
      await this.repo.reject(cert.id, result.reason ?? 'VERIFICATION_FAILED');
      return;
    }

    const preview = await this.scoring.preview(cert.placeId);
    await this.repo.applyAccrual({
      certId: cert.id,
      userId: cert.userId,
      placeId: cert.placeId,
      preview,
    });
  }
}
```

- [ ] **Step 4: Module에 프로세서 등록**

`src/modules/certifications/certifications.module.ts`의 `providers` 배열에 추가:
```ts
    CertificationsProcessor,
```
그리고 상단 import: `import { CertificationsProcessor } from './certifications.processor';`

- [ ] **Step 5: GREEN + 전체 + 빌드**

Run: `corepack pnpm test -- certifications.processor` → PASS 3/3
Run: `corepack pnpm test && corepack pnpm build` → 전체 통과 + 빌드 성공.

- [ ] **Step 6: 커밋**
```bash
git add src/modules/certifications/
git commit -m "feat(certifications): worker processor — verify then first-collection accrual"
```

---

### Task 7: Controller + 앱 배선 + 볼륨 + Swagger

**Files:**
- Create: `src/modules/certifications/certifications.controller.ts`
- Modify: `src/modules/certifications/certifications.module.ts` (controllers)
- Modify: `src/app.module.ts` (CertificationsModule 등록)
- Modify: `compose.server.yml`, `docker-compose.yml` (uploads 볼륨)
- Modify: `package.json` (devDep `@types/multer`)

**Interfaces:**
- Consumes: Task 5 `CertificationsService`, Task 2 `STORAGE`/`StoragePort`.
- Produces: `POST /api/me/certifications/photos`, `POST /api/me/certifications`, `GET /api/me/certifications/:id`, `GET /api/certifications/photos/:key(*)`.

- [ ] **Step 1: multer 타입 devDep 추가**
```bash
corepack pnpm add -D @types/multer
```
Expected: `@types/multer`가 devDependencies에 추가(FileInterceptor의 `Express.Multer.File` 타입용).

- [ ] **Step 2: Controller 작성**

`src/modules/certifications/certifications.controller.ts`:
```ts
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Body,
  NotFoundException,
  ParseUUIDPipe,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { CertificationsService } from './certifications.service';
import { SubmitCertificationDto } from './dto/certification.dto';
import { STORAGE, type StoragePort, MIME_EXT } from './storage/storage.port';
import { Inject } from '@nestjs/common';

const MAX_BYTES = 10 * 1024 * 1024;

@ApiTags('certifications')
@Controller()
export class CertificationsController {
  constructor(
    private readonly certs: CertificationsService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  /** 인증 사진 업로드 (1단계). */
  @Post('me/certifications/photos')
  @ApiBearerAuth()
  @ApiOperation({ summary: '인증 사진 업로드' })
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    if (!MIME_EXT[file.mimetype]) throw new BadRequestException('unsupported image type');
    if (file.size > MAX_BYTES) throw new BadRequestException('file too large (max 10MB)');
    return this.certs.uploadPhoto(file.buffer, file.mimetype);
  }

  /** 방문 인증 제출 (2단계) — 동기 근접판정 후 비동기 검증 큐로. */
  @Post('me/certifications')
  @ApiBearerAuth()
  @ApiOperation({ summary: '방문 인증 제출 (근접판정 후 비동기 검증)' })
  @UseGuards(JwtAuthGuard)
  submit(@Body() dto: SubmitCertificationDto, @CurrentUser() user: AuthUser) {
    return this.certs.submit(user.userId, dto);
  }

  /** 인증 상태 조회 (폴링). */
  @Get('me/certifications/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '인증 상태 조회' })
  @UseGuards(JwtAuthGuard)
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.certs.getCertification(user.userId, id);
  }

  /** 인증 사진 서빙 — PRIVATE은 본인만, PUBLIC은 게스트 포함. */
  @Get('certifications/photos/:key(*)')
  @ApiOperation({ summary: '인증 사진 서빙' })
  @UseGuards(OptionalJwtAuthGuard)
  async photo(
    @Param('key') key: string,
    @OptionalUser() user: AuthUser | null,
    @Res() res: Response,
  ) {
    const meta = await this.certs.getPhotoMeta(key, user?.userId ?? null);
    if (!meta) throw new NotFoundException('photo not found');
    const file = await this.storage.read(key);
    if (!file) throw new NotFoundException('photo not found');
    res.setHeader('Content-Type', file.mime);
    file.stream.pipe(res);
  }
}
```

- [ ] **Step 3: Service에 getPhotoMeta 추가** (visibility 판정)

`src/modules/certifications/certifications.service.ts`의 클래스에 메서드 추가:
```ts
  /** 사진 접근 가능 여부 — PUBLIC이면 누구나, PRIVATE이면 본인만. 접근 불가/없음이면 null. */
  async getPhotoMeta(imageKey: string, userId: string | null): Promise<{ ok: true } | null> {
    const cert = await this.repo.findByImageKey(imageKey);
    if (!cert) return null;
    if (cert.visibility === 'PUBLIC') return { ok: true };
    if (userId && cert.userId === userId) return { ok: true };
    return null;
  }
```
그리고 Repository에 조회 메서드 추가 (`certifications.repository.ts`):
```ts
  async findByImageKey(
    imageKey: string,
  ): Promise<{ userId: string; visibility: string } | null> {
    const [row] = await this.db
      .select({ userId: certifications.userId, visibility: certifications.visibility })
      .from(certifications)
      .where(eq(certifications.imageKey, imageKey));
    return row ?? null;
  }
```

- [ ] **Step 4: Module controllers + app.module 등록**

`certifications.module.ts`: `controllers: [CertificationsController],` 추가 + import.

`src/app.module.ts`: import `import { CertificationsModule } from '@modules/certifications/certifications.module';` + imports 배열에 `CertificationsModule,` 추가(ScoringModule 아래).

- [ ] **Step 5: 볼륨 마운트**

`compose.server.yml`의 app·worker 서비스 각각에 볼륨 추가:
```yaml
    volumes:
      - handdam-uploads:/app/uploads
```
그리고 최상위 `volumes:` 블록에 `handdam-uploads:` 추가.
`docker-compose.yml`(로컬 dev)에는 app/worker 서비스가 없으므로(인프라만) 볼륨 추가 불필요 — 로컬 앱은 `.env`의 `STORAGE_DIR`를 로컬 경로(예: `./.uploads`)로 두거나 기본값 사용. `.env.example`이 있으면 `STORAGE_DIR=/app/uploads` 주석 추가.

- [ ] **Step 6: 전체 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 전체 통과 + 빌드 성공.

- [ ] **Step 7: 커밋**
```bash
git add src/modules/certifications/ src/app.module.ts compose.server.yml package.json pnpm-lock.yaml
git commit -m "feat(certifications): endpoints (upload/submit/get/photo) + wiring + uploads volume"
```

---

## 배포/검증 (전체 구현 후)

1. 마이그레이션 0012 적용(로컬 Task1에서 완료, 서버는 배포 시 `migrate.js`).
2. 서버 배포 시 uploads 볼륨 자동 생성. `.env`에 `STORAGE_DIR=/app/uploads` 확인(기본값 동일).
3. 앱+워커 구동 후 E2E:
   - 회원 토큰으로 `POST /me/certifications/photos`(이미지 multipart) → `{imageKey}`.
   - 장소 좌표 근처 GPS로 `POST /me/certifications` → `{status:PENDING}`.
   - 잠시 후 `GET /me/certifications/:id` → `{status:ACCEPTED, awardedPoints>0}` (워커가 처리).
   - 같은 유저·장소로 재인증 → ACCEPTED되되 `awardedPoints:0, alreadyCollected:true`.
   - 장소에서 먼 GPS → 즉시 `{status:REJECTED}`.
   - `GET /certifications/photos/:key` → 이미지 반환(PUBLIC), PRIVATE은 타인 403/404.
4. 워커 로그에서 job 처리 확인: `docker logs handdam-worker`.

## Self-Review 결과

- **스펙 커버리지:** 데이터모델→T1, StoragePort→T2, VerifierPort→T3, BullMQ인프라→T4, 업로드/제출/근접게이트/멱등/조회→T5, 검증→적립(첫수집)→T6, 4개 엔드포인트/서빙/볼륨/Swagger→T7. 정책(GPS미저장·SSOT·첫수집·멱등3중·반경config)→스키마(T1)+서비스(T5)+repo(T5)+프로세서(T6)에 반영. 누락 없음.
- **Placeholder:** 없음 — 모든 스텝 실제 코드/명령/기대값.
- **타입 일관성:** `StoragePort.save/read/exists`(T2)↔서비스·컨트롤러 사용부, `VerifierPort.verify`(T3)↔프로세서, `ScorePreview`(scoring)↔`applyAccrual` 입력, `submit`/`getResult` 반환↔컨트롤러, 큐 이름 `'certification'`(T4 registerQueue ↔ T5 @InjectQueue ↔ T6 @Processor) 일치. 멱등: `findByUserImageKey`(T5) 재사용.
- **주의(구현 시 확인):** ① Nest10 `@nestjs/bullmq` `WorkerHost.process` 시그니처 확인(버전에 따라 `process(job)` 단일). ② `Express.Multer.File` 타입은 `@types/multer`(T7 Step1) 필요. ③ 서빙 라우트 `:key(*)`는 슬래시 포함 키 매칭용 — Express5/Nest 버전에서 와일드카드 문법 다르면 `@Get('certifications/photos/*')` + `req.params[0]`로 대체.
