# 구도 가이드(Compositions) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여행지별 촬영 구도 가이드(설명+예시 사진) — 큐레이터가 등록(어드민 CRUD)하고 앱이 조회(`GET /places/:id/compositions`).

**Architecture:** StoragePort를 `platform/storage`(공용 @Global)로 승격하고 folder 파라미터화(인증 동작 불변). `places` 모듈에 `compositions` repo/service를 추가하고, 공개 조회·이미지 서빙은 `places.controller`, 어드민 CRUD는 `admin-places.controller`에 배치. 신규 테이블 place_composition(+trans).

**Tech Stack:** NestJS 11, Drizzle(PostgreSQL), @nestjs/platform-express(FileInterceptor), nestjs-zod, Jest. 스펙: `docs/superpowers/specs/2026-07-11-compositions-design.md`

## Global Constraints

- **브랜치**: `feat/compositions` (main 최신에서 생성). Co-Authored-By 트레일러 금지.
- **툴체인**: `export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$HOME/Library/pnpm:$PATH"` 후 `corepack pnpm ...`. `lint` 실행 금지.
- **응답 envelope**: 성공 `{result:...}`만 — 컨트롤러는 payload만 반환.
- **정책(정확값)**:
  - 조회 공개, 어드민 CRUD는 ADMIN+(AdminJwtGuard+AdminRolesGuard, `@AdminRoles('SUPER_ADMIN','ADMIN')`).
  - place ACTIVE 아니면 조회/생성 404(`Place not found`). placeId/compositionId UUID 검증(400).
  - 조회: seq ASC, title/description locale(KO 폴백; title 없으면 '', description 없으면 null), exampleImageUrl = image_key 있으면 `/api/places/compositions/photos/{key}` 아니면 null.
  - source enum `CURATED|AI`, 기본 CURATED. 생성 시 KO 번역 필수(없으면 400).
  - 업로드: MIME `image/jpeg|png|webp`, ≤10MB, folder `'compositions'`.
  - 이미지 서빙: 항상 공개(visibility 없음), path-traversal allowlist `compositions/<id>.<ext>` 아니면 404.
  - StoragePort.save 폴더 기본값 `'certifications'` → **인증 동작 불변**.
- **경로 별칭**: `@db/schema`, `@platform/...`, `@modules/...`.
- 현재 테스트 기준선 104. 착수 전 `corepack pnpm test`로 재확인.

---

### Task 1: StoragePort를 platform으로 승격 + folder 파라미터화 (@Global StorageModule)

**Files:**
- Create: `src/platform/storage/storage.port.ts`, `src/platform/storage/local-storage.ts`, `src/platform/storage/local-storage.spec.ts`, `src/platform/storage/storage.module.ts`
- Delete: `src/modules/certifications/storage/storage.port.ts`, `.../local-storage.ts`, `.../local-storage.spec.ts`
- Modify: `src/modules/certifications/certifications.module.ts`, `.../certifications.controller.ts`, `.../certifications.service.ts` (import 경로), `src/app.module.ts`

**Interfaces:**
- Produces: `@platform/storage/storage.port` exports `STORAGE`(토큰), `StoragePort`, `MIME_EXT`, `EXT_MIME`. `StoragePort.save(buffer, mime, folder?='certifications')`. `@Global` `StorageModule`이 `STORAGE`→`LocalStorage` 제공·export. Task 4·5가 사용.

- [ ] **Step 1: 브랜치 + 파일 이동**
```bash
git checkout main && git checkout -b feat/compositions
git mv src/modules/certifications/storage/storage.port.ts src/platform/storage/storage.port.ts
git mv src/modules/certifications/storage/local-storage.ts src/platform/storage/local-storage.ts
git mv src/modules/certifications/storage/local-storage.spec.ts src/platform/storage/local-storage.spec.ts
```
`src/platform/storage/` 디렉터리가 없으면 `git mv`가 자동 생성. 남은 빈 `src/modules/certifications/storage/`는 삭제(비어 있으면 자동).

- [ ] **Step 2: save에 folder 파라미터 추가**

`src/platform/storage/storage.port.ts`의 인터페이스 시그니처 변경:
```ts
  /** 이미지 버퍼 저장 → 접근 키 반환. folder는 키 접두어(기본 certifications). 미지원 mime이면 throw. */
  save(buffer: Buffer, mime: string, folder?: string): Promise<{ key: string }>;
```
`src/platform/storage/local-storage.ts`의 `save` 교체:
```ts
  async save(buffer: Buffer, mime: string, folder = 'certifications'): Promise<{ key: string }> {
    const ext = MIME_EXT[mime];
    if (!ext) throw new Error(`unsupported mime: ${mime}`);
    const key = `${folder}/${this.id.generate()}.${ext}`;
    const full = join(this.root, key);
    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(full, buffer);
    return { key };
  }
```
(클래스 상단 주석의 "certifications/<id>" 예시는 "<folder>/<id>"로 다듬기.)

- [ ] **Step 3: StorageModule 작성**

`src/platform/storage/storage.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { STORAGE } from './storage.port';
import { LocalStorage } from './local-storage';

/** 공용 파일 저장(로컬 디스크). STORAGE 토큰을 전역 제공. S3 전환 시 여기만 교체. */
@Global()
@Module({
  providers: [{ provide: STORAGE, useClass: LocalStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
```

- [ ] **Step 4: certifications import 경로 갱신 + 로컬 바인딩 제거**

- `certifications.module.ts`: `STORAGE`/`LocalStorage`의 `./storage/...` import 삭제, providers 배열의 `{ provide: STORAGE, useClass: LocalStorage }` 삭제(이제 전역). VERIFIER 바인딩은 그대로.
- `certifications.controller.ts`: `import { STORAGE, type StoragePort, MIME_EXT } from './storage/storage.port';` → `from '@platform/storage/storage.port';`
- `certifications.service.ts`: `import { STORAGE, type StoragePort } from './storage/storage.port';` → `from '@platform/storage/storage.port';`
- `local-storage.spec.ts`(이동됨): import는 `./local-storage` 그대로(같은 폴더).

- [ ] **Step 5: app.module에 StorageModule 등록**

`src/app.module.ts`: `import { StorageModule } from '@platform/storage/storage.module';` + imports 배열에서 `PlatformModule`/`QueueModule` 근처에 `StorageModule,` 추가.

- [ ] **Step 6: folder 파라미터 테스트 추가**

`src/platform/storage/local-storage.spec.ts`의 describe에 추가:
```ts
  it('saves under a custom folder when provided', async () => {
    const store = make(dir);
    const { key } = await store.save(Buffer.from('x'), 'image/jpeg', 'compositions');
    expect(key).toBe('compositions/id-1.jpg');
    expect(existsSync(join(dir, key))).toBe(true);
  });
```
(기존 테스트의 기본 폴더 케이스 — `certifications/id-1.jpg` — 는 그대로 유지되어 기본값 불변을 검증한다.)

- [ ] **Step 7: 전체 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 전체 통과(인증 테스트 포함 회귀 없음) + 빌드 성공. `dist`에 `platform/storage/*` 생성.

- [ ] **Step 8: 커밋**
```bash
git add -A
git commit -m "refactor(storage): promote StoragePort to platform + folder param (@Global StorageModule)"
```

---

### Task 2: 스키마 — place_composition(+trans) + source enum (마이그레이션 0013)

**Files:**
- Create: `src/db/schema/compositions.ts`
- Modify: `src/db/schema/index.ts`
- Create(생성기): `src/db/migrations/0013_*.sql` + meta

**Interfaces:**
- Produces: Drizzle `placeCompositions`(place_composition), `placeCompositionTrans`(place_composition_trans), enum `compositionSourceEnum`. Task 3이 사용.

- [ ] **Step 1: 스키마 파일 작성**

`src/db/schema/compositions.ts`:
```ts
import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  text,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { localeEnum } from './enums';
import { places } from './places';

export const compositionSourceEnum = pgEnum('composition_source', ['CURATED', 'AI']);

/** 여행지 촬영 구도 가이드(큐레이터 등록). 설명/제목은 place_composition_trans(i18n). */
export const placeCompositions = pgTable(
  'place_composition',
  {
    id: uuid('id').primaryKey(),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    source: compositionSourceEnum('source').notNull().default('CURATED'),
    exampleImageKey: text('example_image_key'), // StoragePort 키(없으면 null)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ placeIdx: index('place_composition_place_idx').on(t.placeId) }),
);

/** 구도 다국어 텍스트 (KO 폴백). */
export const placeCompositionTrans = pgTable(
  'place_composition_trans',
  {
    compositionId: uuid('composition_id')
      .notNull()
      .references(() => placeCompositions.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.compositionId, t.locale] }) }),
);

export type PlaceComposition = typeof placeCompositions.$inferSelect;
export type PlaceCompositionTrans = typeof placeCompositionTrans.$inferSelect;
```

`src/db/schema/index.ts` 끝에 추가:
```ts
export * from './compositions';
```

- [ ] **Step 2: 마이그레이션 생성 + 빌드 + 적용**
```bash
corepack pnpm db:generate --name compositions
corepack pnpm build
corepack pnpm db:migrate
```
Expected: `0013_compositions.sql`(enum + 2 테이블 + FK/index/PK), 빌드 성공, 적용 성공.

검증:
```bash
docker exec handdam-postgres psql -U $(docker exec handdam-postgres printenv POSTGRES_USER) -d $(docker exec handdam-postgres printenv POSTGRES_DB) -c "\d place_composition" | grep -E "seq|source|example_image_key"
```
Expected: seq, source, example_image_key 존재.

- [ ] **Step 3: 커밋**
```bash
git add src/db/schema/compositions.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(db): place_composition + trans tables (composition guide)"
```

---

### Task 3: compositions repository + 공개 조회 서비스 (TDD)

**Files:**
- Create: `src/modules/places/compositions.repository.ts`
- Create: `src/modules/places/compositions.service.ts`
- Create: `src/modules/places/compositions.service.spec.ts`
- Modify: `src/modules/places/places.module.ts` (providers에 추가)

**Interfaces:**
- Consumes: Task 2 스키마.
- Produces:
```ts
// repository
placeActive(placeId): Promise<boolean>                       // ACTIVE place 존재
listForPlace(placeId): Promise<{ id:string; seq:number; source:string; exampleImageKey:string|null }[]>  // seq ASC
transForCompositions(ids: string[], locales: Locale[]): Promise<{ compositionId:string; locale:string; title:string; description:string|null }[]>
create(input: { id:string; placeId:string; seq:number; source:'CURATED'|'AI'; exampleImageKey:string|null }, translations: { locale:string; title:string; description:string|null }[]): Promise<void>  // 트랜잭션
deleteById(id: string): Promise<boolean>                     // 삭제 여부
// service (공개)
CompositionItem = { seq:number; title:string; description:string|null; exampleImageUrl:string|null; source:string }
CompositionsService.forPlace(placeId: string, locale: Locale): Promise<CompositionItem[]>
```
Task 4가 service에 어드민 메서드 추가, Task 5 컨트롤러가 호출.

- [ ] **Step 1: 실패하는 조회 테스트 작성**

`src/modules/places/compositions.service.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { CompositionsService } from './compositions.service';

describe('CompositionsService', () => {
  let repo: any, storage: any, id: any, service: CompositionsService;

  beforeEach(() => {
    repo = {
      placeActive: jest.fn(),
      listForPlace: jest.fn(),
      transForCompositions: jest.fn(),
      create: jest.fn(),
      deleteById: jest.fn(),
    };
    storage = { save: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `c-${++n}`) };
    service = new CompositionsService(repo, storage, id);
  });

  describe('forPlace', () => {
    it('maps compositions seq-ordered with locale title/desc + imageUrl, null when no image', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([
        { id: 'k1', seq: 1, source: 'CURATED', exampleImageKey: 'compositions/a.jpg' },
        { id: 'k2', seq: 2, source: 'CURATED', exampleImageKey: null },
      ]);
      repo.transForCompositions.mockResolvedValue([
        { compositionId: 'k1', locale: 'KO', title: '정자+바다', description: '함께' },
        { compositionId: 'k2', locale: 'KO', title: '정자+바위', description: null },
      ]);
      const out = await service.forPlace('p1', 'KO');
      expect(repo.transForCompositions).toHaveBeenCalledWith(['k1', 'k2'], ['KO', 'KO']);
      expect(out).toEqual([
        { seq: 1, title: '정자+바다', description: '함께', exampleImageUrl: '/api/places/compositions/photos/compositions/a.jpg', source: 'CURATED' },
        { seq: 2, title: '정자+바위', description: null, exampleImageUrl: null, source: 'CURATED' },
      ]);
    });

    it('title falls back to empty string when no translation', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([{ id: 'k9', seq: 1, source: 'AI', exampleImageKey: null }]);
      repo.transForCompositions.mockResolvedValue([]); // 번역 없음
      const out = await service.forPlace('p1', 'EN');
      expect(repo.transForCompositions).toHaveBeenCalledWith(['k9'], ['EN', 'KO']);
      expect(out).toEqual([{ seq: 1, title: '', description: null, exampleImageUrl: null, source: 'AI' }]);
    });

    it('throws NotFound when place is not ACTIVE', async () => {
      repo.placeActive.mockResolvedValue(false);
      await expect(service.forPlace('nope', 'KO')).rejects.toThrow(NotFoundException);
      expect(repo.listForPlace).not.toHaveBeenCalled();
    });

    it('returns empty array when place has no compositions', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([]);
      const out = await service.forPlace('p1', 'KO');
      expect(out).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- compositions.service`
Expected: FAIL — `Cannot find module './compositions.service'`

- [ ] **Step 3: Repository 작성**

`src/modules/places/compositions.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  places,
  placeCompositions,
  placeCompositionTrans,
  type localeEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class CompositionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  async listForPlace(
    placeId: string,
  ): Promise<{ id: string; seq: number; source: string; exampleImageKey: string | null }[]> {
    return this.db
      .select({
        id: placeCompositions.id,
        seq: placeCompositions.seq,
        source: placeCompositions.source,
        exampleImageKey: placeCompositions.exampleImageKey,
      })
      .from(placeCompositions)
      .where(eq(placeCompositions.placeId, placeId))
      .orderBy(asc(placeCompositions.seq));
  }

  async transForCompositions(
    ids: string[],
    locales: Locale[],
  ): Promise<{ compositionId: string; locale: string; title: string; description: string | null }[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        compositionId: placeCompositionTrans.compositionId,
        locale: placeCompositionTrans.locale,
        title: placeCompositionTrans.title,
        description: placeCompositionTrans.description,
      })
      .from(placeCompositionTrans)
      .where(
        and(
          inArray(placeCompositionTrans.compositionId, ids),
          inArray(placeCompositionTrans.locale, locales),
        ),
      );
  }

  async create(
    input: {
      id: string;
      placeId: string;
      seq: number;
      source: 'CURATED' | 'AI';
      exampleImageKey: string | null;
    },
    translations: { locale: string; title: string; description: string | null }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(placeCompositions).values({
        id: input.id,
        placeId: input.placeId,
        seq: input.seq,
        source: input.source,
        exampleImageKey: input.exampleImageKey,
      });
      await tx.insert(placeCompositionTrans).values(
        translations.map((t) => ({
          compositionId: input.id,
          locale: t.locale as Locale,
          title: t.title,
          description: t.description,
        })),
      );
    });
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(placeCompositions)
      .where(eq(placeCompositions.id, id))
      .returning({ id: placeCompositions.id });
    return rows.length > 0;
  }
}
```

- [ ] **Step 4: Service 작성 (공개 조회)**

`src/modules/places/compositions.service.ts`:
```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { IdService } from '@platform/id/id.service';
import { STORAGE, type StoragePort } from '@platform/storage/storage.port';
import { CompositionsRepository } from './compositions.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface CompositionItem {
  seq: number;
  title: string;
  description: string | null;
  exampleImageUrl: string | null;
  source: string;
}

@Injectable()
export class CompositionsService {
  constructor(
    private readonly repo: CompositionsRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly id: IdService,
  ) {}

  /** 공개 조회 — seq순, locale/KO 폴백, imageUrl 조립. */
  async forPlace(placeId: string, locale: Locale): Promise<CompositionItem[]> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    const rows = await this.repo.listForPlace(placeId);
    const trans = await this.repo.transForCompositions(
      rows.map((r) => r.id),
      [locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(trans.filter((x) => x.compositionId === r.id), locale);
      return {
        seq: r.seq,
        title: t?.title ?? '',
        description: t?.description ?? null,
        exampleImageUrl: r.exampleImageKey
          ? `/api/places/compositions/photos/${r.exampleImageKey}`
          : null,
        source: r.source,
      };
    });
  }

  private pickTrans(
    trans: { locale: string; title: string; description: string | null }[],
    locale: Locale,
  ) {
    return trans.find((t) => t.locale === locale) ?? trans.find((t) => t.locale === 'KO');
  }
}
```

- [ ] **Step 5: places.module에 배선**

`src/modules/places/places.module.ts`: import `CompositionsRepository`/`CompositionsService`, providers 배열에 둘 추가, exports에 `CompositionsService` 추가(컨트롤러가 다른 모듈이 아니라 같은 모듈이므로 export는 선택이지만 일관성 위해 추가). StorageModule은 @Global이라 별도 import 불필요.

- [ ] **Step 6: GREEN + 전체 + 빌드**

Run: `corepack pnpm test -- compositions.service` → PASS 4/4
Run: `corepack pnpm test && corepack pnpm build` → 전체 통과 + 빌드 성공.

- [ ] **Step 7: 커밋**
```bash
git add src/modules/places/compositions.repository.ts src/modules/places/compositions.service.ts src/modules/places/compositions.service.spec.ts src/modules/places/places.module.ts
git commit -m "feat(places): compositions repository + public read service"
```

---

### Task 4: 어드민 서비스 (생성/목록/삭제/업로드, TDD)

**Files:**
- Modify: `src/modules/places/compositions.service.ts` (어드민 메서드 추가)
- Modify: `src/modules/places/compositions.service.spec.ts` (어드민 describe 추가)

**Interfaces:**
- Consumes: Task 3 repo, `STORAGE`/`StoragePort`(save with folder), `IdService`.
- Produces:
```ts
AdminCompositionItem = { id:string; seq:number; source:string; exampleImageUrl:string|null; translations:{ locale:string; title:string; description:string|null }[] }
CompositionsService.uploadPhoto(buffer: Buffer, mime: string): Promise<{ imageKey:string }>
CompositionsService.adminCreate(placeId: string, cmd: { seq:number; source?:'CURATED'|'AI'; imageKey?:string; translations:{ locale:string; title:string; description?:string }[] }): Promise<{ compositionId:string }>
CompositionsService.adminList(placeId: string): Promise<AdminCompositionItem[]>
CompositionsService.adminDelete(compositionId: string): Promise<void>  // 없으면 404
```
Task 5 어드민 컨트롤러가 호출.

- [ ] **Step 1: 실패하는 어드민 테스트 추가**

`compositions.service.spec.ts`에 describe 추가:
```ts
  describe('admin', () => {
    it('uploadPhoto stores under compositions folder', async () => {
      storage.save.mockResolvedValue({ key: 'compositions/a.jpg' });
      const out = await service.uploadPhoto(Buffer.from('x'), 'image/jpeg');
      expect(storage.save).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'compositions');
      expect(out).toEqual({ imageKey: 'compositions/a.jpg' });
    });

    it('adminCreate inserts composition + trans (default source CURATED)', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.create.mockResolvedValue(undefined);
      const out = await service.adminCreate('p1', {
        seq: 1,
        imageKey: 'compositions/a.jpg',
        translations: [{ locale: 'KO', title: '정자+바다', description: '함께' }],
      });
      expect(out).toEqual({ compositionId: 'c-1' });
      expect(repo.create).toHaveBeenCalledWith(
        { id: 'c-1', placeId: 'p1', seq: 1, source: 'CURATED', exampleImageKey: 'compositions/a.jpg' },
        [{ locale: 'KO', title: '정자+바다', description: '함께' }],
      );
    });

    it('adminCreate throws NotFound when place inactive', async () => {
      repo.placeActive.mockResolvedValue(false);
      await expect(
        service.adminCreate('nope', { seq: 1, translations: [{ locale: 'KO', title: 't' }] }),
      ).rejects.toThrow('Place not found');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('adminCreate throws BadRequest when KO translation missing', async () => {
      repo.placeActive.mockResolvedValue(true);
      await expect(
        service.adminCreate('p1', { seq: 1, translations: [{ locale: 'EN', title: 't' }] }),
      ).rejects.toThrow('KO translation is required');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('adminList assembles per-composition translations, imageUrl null when no key', async () => {
      repo.listForPlace.mockResolvedValue([
        { id: 'k1', seq: 1, source: 'CURATED', exampleImageKey: 'compositions/a.jpg' },
      ]);
      repo.transForCompositions.mockResolvedValue([
        { compositionId: 'k1', locale: 'KO', title: '정자', description: null },
        { compositionId: 'k1', locale: 'EN', title: 'Pavilion', description: 'x' },
      ]);
      const out = await service.adminList('p1');
      expect(repo.transForCompositions).toHaveBeenCalledWith(['k1'], ['KO', 'EN', 'JA', 'ZH']);
      expect(out).toEqual([
        {
          id: 'k1',
          seq: 1,
          source: 'CURATED',
          exampleImageUrl: '/api/places/compositions/photos/compositions/a.jpg',
          translations: [
            { locale: 'KO', title: '정자', description: null },
            { locale: 'EN', title: 'Pavilion', description: 'x' },
          ],
        },
      ]);
    });

    it('adminDelete throws NotFound when composition missing', async () => {
      repo.deleteById.mockResolvedValue(false);
      await expect(service.adminDelete('nope')).rejects.toThrow('Composition not found');
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `corepack pnpm test -- compositions.service`
Expected: FAIL — `service.uploadPhoto is not a function`

- [ ] **Step 3: 어드민 메서드 구현**

`compositions.service.ts` — 상단에 인터페이스 + `localeEnum` 값 상수 추가:
```ts
import { NotFoundException, BadRequestException } from '@nestjs/common';
// (이미 NotFoundException import 중이면 BadRequestException만 추가)
import { localeEnum } from '@db/schema'; // 값으로도 사용 (enumValues)

export interface AdminCompositionItem {
  id: string;
  seq: number;
  source: string;
  exampleImageUrl: string | null;
  translations: { locale: string; title: string; description: string | null }[];
}
```
클래스에 메서드 추가:
```ts
  async uploadPhoto(buffer: Buffer, mime: string): Promise<{ imageKey: string }> {
    const { key } = await this.storage.save(buffer, mime, 'compositions');
    return { imageKey: key };
  }

  async adminCreate(
    placeId: string,
    cmd: {
      seq: number;
      source?: 'CURATED' | 'AI';
      imageKey?: string;
      translations: { locale: string; title: string; description?: string }[];
    },
  ): Promise<{ compositionId: string }> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    if (!cmd.translations.some((t) => t.locale === 'KO')) {
      throw new BadRequestException('KO translation is required');
    }
    const compositionId = this.id.generate();
    await this.repo.create(
      {
        id: compositionId,
        placeId,
        seq: cmd.seq,
        source: cmd.source ?? 'CURATED',
        exampleImageKey: cmd.imageKey ?? null,
      },
      cmd.translations.map((t) => ({
        locale: t.locale,
        title: t.title,
        description: t.description ?? null,
      })),
    );
    return { compositionId };
  }

  async adminList(placeId: string): Promise<AdminCompositionItem[]> {
    const rows = await this.repo.listForPlace(placeId);
    const trans = await this.repo.transForCompositions(
      rows.map((r) => r.id),
      [...localeEnum.enumValues], // 전 locale
    );
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      source: r.source,
      exampleImageUrl: r.exampleImageKey
        ? `/api/places/compositions/photos/${r.exampleImageKey}`
        : null,
      translations: trans
        .filter((t) => t.compositionId === r.id)
        .map((t) => ({ locale: t.locale, title: t.title, description: t.description })),
    }));
  }

  async adminDelete(compositionId: string): Promise<void> {
    const ok = await this.repo.deleteById(compositionId);
    if (!ok) throw new NotFoundException('Composition not found');
  }
```

- [ ] **Step 4: GREEN + 전체 + 빌드**

Run: `corepack pnpm test -- compositions.service` → PASS (조회 4 + 어드민 6)
Run: `corepack pnpm test && corepack pnpm build` → 전체 통과 + 빌드 성공.

- [ ] **Step 5: 커밋**
```bash
git add src/modules/places/compositions.service.ts src/modules/places/compositions.service.spec.ts
git commit -m "feat(places): composition admin ops (create/list/delete/upload)"
```

---

### Task 5: 컨트롤러(공개 조회·서빙 + 어드민 CRUD) + DTO + Swagger

**Files:**
- Modify: `src/modules/places/dto/place.dto.ts` (`CreateCompositionDto` 추가)
- Modify: `src/modules/places/places.controller.ts` (공개 조회 + 이미지 서빙)
- Modify: `src/modules/places/admin-places.controller.ts` (어드민 CRUD)

**Interfaces:**
- Consumes: Task 3·4 `CompositionsService`, `STORAGE`/`StoragePort`.
- Produces: `GET /api/places/:id/compositions`, `GET /api/places/compositions/photos/:key`, `POST /api/admin/places/:id/compositions/photos`, `POST /api/admin/places/:id/compositions`, `GET /api/admin/places/:id/compositions`, `DELETE /api/admin/places/compositions/:compositionId`.

- [ ] **Step 1: DTO 추가**

`src/modules/places/dto/place.dto.ts`:
```ts
export class CreateCompositionDto extends createZodDto(
  z.object({
    seq: z.coerce.number().int().min(0).describe('표시 순서'),
    source: z.enum(['CURATED', 'AI']).optional().describe('출처(기본 CURATED)'),
    imageKey: z.string().optional().describe('업로드 응답의 imageKey(선택)'),
    translations: z
      .array(
        z.object({
          locale: z.enum(['KO', 'EN', 'JA', 'ZH']),
          title: z.string().min(1),
          description: z.string().optional(),
        }),
      )
      .min(1)
      .describe('번역(KO 필수)'),
  }),
) {}
```

- [ ] **Step 2: 공개 컨트롤러 라우트 (places.controller) — ⚠️ 라우트 순서**

`src/modules/places/places.controller.ts`:
- import: `import { Inject } from '@nestjs/common';` 및 `import { STORAGE, type StoragePort } from '@platform/storage/storage.port';`, `import { CompositionsService } from './compositions.service';`, `Res`/`NotFoundException`/`Get`(이미 있음). Express `Response` 타입.
- 생성자에 주입 추가: `private readonly compositions: CompositionsService`, `@Inject(STORAGE) private readonly storage: StoragePort`.
- 상단에 allowlist 상수: `const SAFE_COMPOSITION_KEY = /^compositions\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;`
- 라우트를 **다음 순서로** 배치(기존 `@Get()` list, `@Get('nearby')` 아래, `@Get(':id')` **위**):
```ts
  /** 여행지 구도 가이드 (공개). */
  @ApiOperation({ summary: '여행지 구도 가이드' })
  @Get('compositions/photos/:key(*)')
  async compositionPhoto(@Param('key') key: string, @Res() res: Response) {
    if (!SAFE_COMPOSITION_KEY.test(key)) throw new NotFoundException('photo not found');
    const file = await this.storage.read(key);
    if (!file) throw new NotFoundException('photo not found');
    res.setHeader('Content-Type', file.mime);
    file.stream.pipe(res);
  }

  @ApiOperation({ summary: '여행지 구도 가이드 목록' })
  @Get(':id/compositions')
  compositions(@Param('id', ParseUUIDPipe) id: string, @ReqContext() ctx: RequestContext) {
    return this.compositions.forPlace(id, ctx.locale);
  }
```
(import에 `ParseUUIDPipe` 추가.) 최종 순서: `@Get()` → `@Get('nearby')` → `@Get('compositions/photos/:key(*)')` → `@Get(':id/compositions')` → `@Get(':id')`.

- [ ] **Step 3: 어드민 컨트롤러 라우트 (admin-places.controller)**

`src/modules/places/admin-places.controller.ts`:
- import 추가: `Delete`, `UploadedFile`, `UseInterceptors`, `BadRequestException`(from `@nestjs/common`); `FileInterceptor`(from `@nestjs/platform-express`); `ApiConsumes`(swagger); `MIME_EXT`(from `@platform/storage/storage.port`); `CompositionsService`; `CreateCompositionDto`. 상단 상수 `const MAX_BYTES = 10 * 1024 * 1024;`
- 생성자에 `private readonly compositions: CompositionsService` 주입.
- 라우트 추가:
```ts
  @ApiOperation({ summary: '구도 예시 이미지 업로드 (어드민)' })
  @ApiConsumes('multipart/form-data')
  @Post(':id/compositions/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async uploadComposition(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    if (!MIME_EXT[file.mimetype]) throw new BadRequestException('unsupported image type');
    return this.compositions.uploadPhoto(file.buffer, file.mimetype);
  }

  @ApiOperation({ summary: '구도 등록 (어드민)' })
  @Post(':id/compositions')
  createComposition(@Param('id') id: string, @Body() dto: CreateCompositionDto) {
    return this.compositions.adminCreate(id, dto);
  }

  @ApiOperation({ summary: '구도 목록 (어드민)' })
  @Get(':id/compositions')
  listCompositions(@Param('id') id: string) {
    return this.compositions.adminList(id);
  }

  @ApiOperation({ summary: '구도 삭제 (어드민)' })
  @Delete('compositions/:compositionId')
  deleteComposition(@Param('compositionId') compositionId: string) {
    return this.compositions.adminDelete(compositionId);
  }
```
주의: 어드민 컨트롤러 라우트 순서도 `@Delete('compositions/:compositionId')`가 `:id/...`류와 충돌하지 않는지 확인(첫 세그먼트 'compositions' 정적 vs `:id` — `POST/GET :id/compositions`는 2세그먼트, `DELETE compositions/:x`는 2세그먼트지만 메서드(POST/GET vs DELETE)와 첫 세그먼트가 달라 충돌 없음).

- [ ] **Step 4: 전체 + 빌드**

Run: `corepack pnpm test && corepack pnpm build`
Expected: 전체 통과 + 빌드 성공.

- [ ] **Step 5: 커밋**
```bash
git add src/modules/places/dto/place.dto.ts src/modules/places/places.controller.ts src/modules/places/admin-places.controller.ts
git commit -m "feat(places): composition endpoints (public read/serve + admin CRUD)"
```

---

## 배포/검증 (전체 구현 후)

1. 마이그레이션 0013 적용(로컬 Task2, 서버 배포 시).
2. 어드민 토큰으로:
   - `POST /admin/places/:id/compositions/photos`(이미지) → `{imageKey}`.
   - `POST /admin/places/:id/compositions`({seq, imageKey, translations:[KO]}) → `{compositionId}`.
   - `GET /admin/places/:id/compositions` → 목록(전 locale).
3. 공개: `GET /api/places/:id/compositions` → seq순, imageUrl 채워짐, `Accept-Language: EN`으로 폴백.
4. `GET /api/places/compositions/photos/<key>` → 이미지, path-traversal → 404.
5. `DELETE /admin/places/compositions/:compositionId` → 삭제 후 조회 반영.
6. 회귀: 인증 사진 업로드/서빙(certifications) 여전히 동작(스토리지 이동 무영향).

## Self-Review 결과

- **스펙 커버리지:** 스토리지 리팩터→T1, 스키마 0013→T2, 공개 조회(seq·locale·imageUrl·404)→T3, 어드민 생성/목록/삭제/업로드→T4, 라우트(공개 조회·서빙·어드민 CRUD)+DTO+Swagger→T5. 인기 사진 자동 구도는 비범위(스펙 명시). 누락 없음.
- **Placeholder:** 없음 — 모든 스텝 실제 코드/명령/기대값.
- **타입 일관성:** `CompositionsRepository`(placeActive/listForPlace/transForCompositions/create/deleteById) ↔ 서비스 사용부·모킹, `CompositionItem`/`AdminCompositionItem` ↔ 테스트 기대, `forPlace`/`adminCreate`/`adminList`/`adminDelete`/`uploadPhoto` ↔ 컨트롤러 호출, `StoragePort.save(...,folder)` ↔ uploadPhoto·cert(기본값), imageUrl 경로 `/api/places/compositions/photos/{key}` ↔ 서빙 라우트. 테스트 수: T1 +1, T3 +4, T4 +6.
- **주의(구현 시):** ① 서빙 라우트 `compositions/photos/:key(*)`를 `:id`보다 먼저(places.controller). ② `localeEnum.enumValues`는 값으로 import해 전 locale 배열 사용. ③ cert 회귀(스토리지 @Global 이동) — 인증 테스트가 storage를 모킹하므로 DI 무관하게 통과하지만, 앱 부팅/서빙은 StorageModule 전역 등록 필요.
