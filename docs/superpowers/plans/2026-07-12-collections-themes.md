# 컬렉션/테마 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민이 큐레이션하는 테마 컬렉션을 도입하고, 도감 테마별 탭·마이페이지 진행률(지역+테마 합본)·테마 상세를 서빙한다.

**Architecture:** 신규 `collections` 모듈. `collection`/`collection_trans`/`collection_place` 3개 테이블(place는 미변경). 진행률은 visit 재사용으로 실시간 계산, 썸네일은 소속 place의 `image_url`. `/me/dogam/themes`도 collections 모듈이 소유해 Dogam↔Collections 순환을 없앤다(Collections→Dogam 단방향). 커서는 도메인 전용(`seq|id`, 병합 `R|code`/`T|seq|id`).

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, drizzle-kit, nestjs-zod, Jest.

## Global Constraints

- 성공 응답은 `{ result: ... }`만 — 컨트롤러는 payload만 반환(전역 ResponseInterceptor).
- user-facing 목록은 커서(themes/collections/detail), 어드민 관리 목록만 offset/page(기존 `adminList` 패턴).
- `visitStatus`는 `'VISITED' | 'NONE'` (로그인+visit → VISITED, 게스트·미방문 → NONE).
- 진행률: `filled` = 소속 place 중 방문 수, `total` = 소속 place 수. "collected = visit"(dogam과 동일).
- 썸네일 = 소속 place `image_url` 앞 **4개**(null 제외). theme는 collection_place.seq순, region은 place.id순.
- i18n: title/description은 `collection_trans`(KO 폴백). KO 필수(어드민 생성).
- 어드민 가드: `@UseGuards(AdminJwtGuard, AdminRolesGuard)` + `@AdminRoles('SUPER_ADMIN','ADMIN')` + `@ApiBearerAuth()`.
- 서비스 단위 테스트는 repo를 순수 jest 목으로 주입(`new CollectionsService(repo, dogam, id)`). repository/컨트롤러/마이그레이션은 빌드+수동 e2e.

---

## File Structure

- `src/db/schema/enums.ts` — `collectionStatusEnum` 추가.
- `src/db/schema/collections.ts` — collection/collection_trans/collection_place + 타입.
- `src/db/schema/index.ts` — collections export.
- `src/db/migrations/00NN_*.sql` — drizzle-kit generate(0015).
- `src/modules/collections/collections.cursor.ts` — `seq|id` + 병합 `R|`/`T|` 인코딩 + 페이지 헬퍼.
- `src/modules/collections/collections.repository.ts` — 전 쿼리.
- `src/modules/collections/collections.service.ts` — 진행률·썸네일·상세·병합·어드민.
- `src/modules/collections/collections.controller.ts` — 공개 `GET /collections/:id`.
- `src/modules/collections/me-collections.controller.ts` — `GET /me/collections`, `GET /me/dogam/themes`.
- `src/modules/collections/admin-collections.controller.ts` — 어드민 CRUD.
- `src/modules/collections/dto/collection.dto.ts` — DTO들.
- `src/modules/collections/collections.module.ts` — 모듈.
- `src/app.module.ts` — CollectionsModule 등록.

---

## Task 1: 스키마 + enum + 마이그레이션

**Files:**
- Modify: `src/db/schema/enums.ts`
- Create: `src/db/schema/collections.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/00NN_*.sql` (drizzle-kit 산출물)

**Interfaces:**
- Produces: `collections`, `collectionTrans`, `collectionPlace` 테이블 + `Collection` 타입. 이후 모든 태스크가 참조.

- [ ] **Step 1: enum 추가**

`src/db/schema/enums.ts` 끝에 추가:
```ts
export const collectionStatusEnum = pgEnum('collection_status', ['ACTIVE', 'HIDDEN']);
```

- [ ] **Step 2: collections 스키마 작성**

Create `src/db/schema/collections.ts`:
```ts
import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { localeEnum, collectionStatusEnum } from './enums';
import { places } from './places';

/** 어드민 큐레이션 테마 컬렉션. 제목/설명은 collection_trans(i18n). */
export const collections = pgTable('collection', {
  id: uuid('id').primaryKey(),
  seq: integer('seq').notNull(),
  status: collectionStatusEnum('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 컬렉션 다국어 텍스트 (KO 폴백). */
export const collectionTrans = pgTable(
  'collection_trans',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    locale: localeEnum('locale').notNull(),
    title: text('title').notNull(),
    description: text('description'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.collectionId, t.locale] }) }),
);

/** 컬렉션 소속 장소 (다대다). */
export const collectionPlace = pgTable(
  'collection_place',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    placeId: uuid('place_id')
      .notNull()
      .references(() => places.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.collectionId, t.placeId] }),
    placeIdx: index('collection_place_place_idx').on(t.placeId),
  }),
);

export type Collection = typeof collections.$inferSelect;
export type CollectionTrans = typeof collectionTrans.$inferSelect;
export type CollectionPlace = typeof collectionPlace.$inferSelect;
```

- [ ] **Step 3: index.ts에서 export**

`src/db/schema/index.ts`에 collections 재출력 라인을 추가한다(기존 `export * from './...'` 패턴과 동일). 파일을 열어 다른 `export * from './xxx';` 옆에 추가:
```ts
export * from './collections';
```

- [ ] **Step 4: 마이그레이션 생성**

Run: `source ~/.nvm/nvm.sh && nvm use 24.14.0 >/dev/null && pnpm db:generate`
Expected: 새 `.sql` 생성. `CREATE TABLE "collection"`, `"collection_trans"`, `"collection_place"`, `CREATE TYPE ... "collection_status"` 포함. 파일 열어 확인. 예상치 못한 다른 테이블 변경이 있으면 STOP 후 보고.

- [ ] **Step 5: 빌드**

Run: `pnpm build`
Expected: 타입 에러 없이 성공.

- [ ] **Step 6: 커밋**
```bash
git add src/db/schema/enums.ts src/db/schema/collections.ts src/db/schema/index.ts src/db/migrations
git commit -m "feat(collections): add collection, collection_trans, collection_place schema"
```

---

## Task 2: 커서 헬퍼 (seq|id + 병합)

**Files:**
- Create: `src/modules/collections/collections.cursor.ts`
- Test: `src/modules/collections/collections.cursor.spec.ts`

**Interfaces:**
- Produces:
  - `encodeSeqCursor(seq: number, id: string): string`, `decodeSeqCursor(cursor?: string): { seq: number; id: string } | null`
  - `buildSeqPage<T>(rows: T[], limit: number, key: (r: T) => { seq: number; id: string }): { items: T[]; nextCursor: string | null }`
  - `encodeMergedRegion(code: string): string`, `encodeMergedTheme(seq: number, id: string): string`
  - `decodeMergedCursor(cursor?: string): { kind: 'REGION'; code: string } | { kind: 'THEME'; seq: number; id: string } | null`

- [ ] **Step 1: 실패 테스트 작성**

Create `src/modules/collections/collections.cursor.spec.ts`:
```ts
import {
  encodeSeqCursor,
  decodeSeqCursor,
  buildSeqPage,
  encodeMergedRegion,
  encodeMergedTheme,
  decodeMergedCursor,
} from './collections.cursor';

describe('collections.cursor', () => {
  it('seq cursor round-trips', () => {
    const c = encodeSeqCursor(3, 'abc');
    expect(decodeSeqCursor(c)).toEqual({ seq: 3, id: 'abc' });
  });

  it('decodeSeqCursor returns null for undefined/garbage', () => {
    expect(decodeSeqCursor(undefined)).toBeNull();
    expect(decodeSeqCursor('!!!not-base64!!!')).toBeNull();
  });

  it('buildSeqPage slices to limit and emits nextCursor from last item', () => {
    const rows = [
      { seq: 1, pid: 'p1' },
      { seq: 2, pid: 'p2' },
    ];
    const page = buildSeqPage(rows, 1, (r) => ({ seq: r.seq, id: r.pid }));
    expect(page.items).toEqual([{ seq: 1, pid: 'p1' }]);
    expect(decodeSeqCursor(page.nextCursor!)).toEqual({ seq: 1, id: 'p1' });
  });

  it('buildSeqPage nextCursor null when no next', () => {
    const rows = [{ seq: 1, id: 'p1' }];
    const page = buildSeqPage(rows, 5, (r) => ({ seq: r.seq, id: r.id }));
    expect(page.nextCursor).toBeNull();
  });

  it('merged region and theme cursors decode by kind', () => {
    expect(decodeMergedCursor(encodeMergedRegion('32'))).toEqual({ kind: 'REGION', code: '32' });
    expect(decodeMergedCursor(encodeMergedTheme(4, 'cid'))).toEqual({ kind: 'THEME', seq: 4, id: 'cid' });
    expect(decodeMergedCursor(undefined)).toBeNull();
    expect(decodeMergedCursor('garbage')).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- collections.cursor.spec`
Expected: FAIL (module not found).

- [ ] **Step 3: 구현**

Create `src/modules/collections/collections.cursor.ts`:
```ts
/** collections 도메인 전용 커서: 테마/상세는 seq|id, 병합은 R|code / T|seq|id. */

export function encodeSeqCursor(seq: number, id: string): string {
  return Buffer.from(`${seq}|${id}`).toString('base64url');
}

export function decodeSeqCursor(cursor?: string): { seq: number; id: string } | null {
  if (!cursor) return null;
  try {
    const [seqStr, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    const seq = Number(seqStr);
    if (!id || !Number.isInteger(seq)) return null;
    return { seq, id };
  } catch {
    return null;
  }
}

/** limit+1로 조회된 rows에서 페이지 + nextCursor(seq|id) 구성. */
export function buildSeqPage<T>(
  rows: T[],
  limit: number,
  key: (r: T) => { seq: number; id: string },
): { items: T[]; nextCursor: string | null } {
  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  const k = last ? key(last) : null;
  return { items, nextCursor: hasNext && k ? encodeSeqCursor(k.seq, k.id) : null };
}

export function encodeMergedRegion(code: string): string {
  return Buffer.from(`R|${code}`).toString('base64url');
}

export function encodeMergedTheme(seq: number, id: string): string {
  return Buffer.from(`T|${seq}|${id}`).toString('base64url');
}

export function decodeMergedCursor(
  cursor?: string,
): { kind: 'REGION'; code: string } | { kind: 'THEME'; seq: number; id: string } | null {
  if (!cursor) return null;
  try {
    const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (parts[0] === 'R' && parts[1]) return { kind: 'REGION', code: parts[1] };
    if (parts[0] === 'T' && parts[2] && Number.isInteger(Number(parts[1]))) {
      return { kind: 'THEME', seq: Number(parts[1]), id: parts[2] };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test -- collections.cursor.spec`
Expected: PASS (5/5).

- [ ] **Step 5: 커밋**
```bash
git add src/modules/collections/collections.cursor.ts src/modules/collections/collections.cursor.spec.ts
git commit -m "feat(collections): domain cursor helpers (seq|id, merged region/theme)"
```

---

## Task 3: 모듈 스켈레톤 + 테마 상세 (GET /collections/:id)

**Files:**
- Create: `src/modules/collections/collections.repository.ts`
- Create: `src/modules/collections/collections.service.ts`
- Create: `src/modules/collections/collections.controller.ts`
- Create: `src/modules/collections/dto/collection.dto.ts`
- Create: `src/modules/collections/collections.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/collections/collections.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 스키마, Task 2 커서(`decodeSeqCursor`, `buildSeqPage`).
- Produces:
  - `CollectionsRepository`: `getActiveCollection(id)`, `collectionTrans(ids, locales)`, `placeTransForMany(placeIds, locales)`, `detailPlacesPage(collectionId, userId, cursor, limit)`, `collectionCounts(collectionId, userId)`.
  - `CollectionsService.getCollectionDetail(id, locale, userId, cursor?, limit?)` →
    `{ id, title, description, counts:{all,visited}, items:[{placeId,name,address,imageUrl,visitStatus}], nextCursor }`
  - `CollectionsModule` (later tasks extend).

- [ ] **Step 1: 상세 실패 테스트 작성**

Create `src/modules/collections/collections.service.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { CollectionsService } from './collections.service';

describe('CollectionsService', () => {
  let repo: any, dogam: any, id: any, service: CollectionsService;

  beforeEach(() => {
    repo = {
      getActiveCollection: jest.fn(),
      collectionTrans: jest.fn(),
      placeTransForMany: jest.fn(),
      detailPlacesPage: jest.fn(),
      collectionCounts: jest.fn(),
    };
    dogam = { regions: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `id-${++n}`) };
    service = new CollectionsService(repo, dogam, id);
  });

  describe('getCollectionDetail', () => {
    it('404 when collection missing or HIDDEN', async () => {
      repo.getActiveCollection.mockResolvedValue(null);
      await expect(service.getCollectionDetail('c1', 'KO', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('maps places with imageUrl, visitStatus, counts; nextCursor from seq', async () => {
      repo.getActiveCollection.mockResolvedValue({ id: 'c1' });
      repo.collectionTrans.mockResolvedValue([
        { collectionId: 'c1', locale: 'KO', title: '동해 명소', description: '설명' },
      ]);
      repo.collectionCounts.mockResolvedValue({ all: 8, visited: 3 });
      repo.detailPlacesPage.mockResolvedValue([
        { placeId: 'p1', seq: 1, imageUrl: 'http://tong/p1.jpg', visited: true },
        { placeId: 'p2', seq: 2, imageUrl: null, visited: false },
      ]);
      repo.placeTransForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초' },
        { placeId: 'p2', locale: 'KO', name: '설악산', address: null },
      ]);

      const out = await service.getCollectionDetail('c1', 'KO', 'u1', undefined, 1);

      expect(out.title).toBe('동해 명소');
      expect(out.description).toBe('설명');
      expect(out.counts).toEqual({ all: 8, visited: 3 });
      expect(out.items).toEqual([
        { placeId: 'p1', name: '영금정', address: '속초', imageUrl: 'http://tong/p1.jpg', visitStatus: 'VISITED' },
      ]);
      expect(out.nextCursor).not.toBeNull();
      // fetch uses limit+1
      expect(repo.detailPlacesPage).toHaveBeenCalledWith('c1', 'u1', null, 2);
    });

    it('guest gets NONE visitStatus', async () => {
      repo.getActiveCollection.mockResolvedValue({ id: 'c1' });
      repo.collectionTrans.mockResolvedValue([{ collectionId: 'c1', locale: 'KO', title: 't', description: null }]);
      repo.collectionCounts.mockResolvedValue({ all: 1, visited: 0 });
      repo.detailPlacesPage.mockResolvedValue([{ placeId: 'p1', seq: 1, imageUrl: null, visited: false }]);
      repo.placeTransForMany.mockResolvedValue([{ placeId: 'p1', locale: 'KO', name: '영금정', address: null }]);

      const out = await service.getCollectionDetail('c1', 'KO', null, undefined, 20);
      expect(out.items[0].visitStatus).toBe('NONE');
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- collections.service.spec`
Expected: FAIL (module not found).

- [ ] **Step 3: Repository 작성 (상세용 쿼리)**

Create `src/modules/collections/collections.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  collections,
  collectionTrans,
  collectionPlace,
  places,
  placeTrans,
  visits,
  type localeEnum,
} from '@db/schema';

type Locale = (typeof localeEnum.enumValues)[number];

@Injectable()
export class CollectionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async getActiveCollection(id: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(and(eq(collections.id, id), eq(collections.status, 'ACTIVE')));
    return row ?? null;
  }

  async collectionTrans(
    ids: string[],
    locales: Locale[],
  ): Promise<{ collectionId: string; locale: string; title: string; description: string | null }[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        collectionId: collectionTrans.collectionId,
        locale: collectionTrans.locale,
        title: collectionTrans.title,
        description: collectionTrans.description,
      })
      .from(collectionTrans)
      .where(and(inArray(collectionTrans.collectionId, ids), inArray(collectionTrans.locale, locales)));
  }

  async placeTransForMany(
    placeIds: string[],
    locales: Locale[],
  ): Promise<{ placeId: string; locale: string; name: string; address: string | null }[]> {
    if (placeIds.length === 0) return [];
    return this.db
      .select({
        placeId: placeTrans.placeId,
        locale: placeTrans.locale,
        name: placeTrans.name,
        address: placeTrans.address,
      })
      .from(placeTrans)
      .where(and(inArray(placeTrans.placeId, placeIds), inArray(placeTrans.locale, locales)));
  }

  /** 소속 장소 keyset(seq ASC, place_id ASC). visited = 이 유저 방문 여부. limit+1 조회. */
  async detailPlacesPage(
    collectionId: string,
    userId: string | null,
    cursor: { seq: number; id: string } | null,
    limit: number,
  ): Promise<{ placeId: string; seq: number; imageUrl: string | null; visited: boolean }[]> {
    const conds: SQL[] = [eq(collectionPlace.collectionId, collectionId)];
    if (cursor) {
      conds.push(
        or(
          gt(collectionPlace.seq, cursor.seq),
          and(eq(collectionPlace.seq, cursor.seq), gt(collectionPlace.placeId, cursor.id)),
        )!,
      );
    }
    const visited = userId ? sql<boolean>`${visits.id} is not null` : sql<boolean>`false`;
    const q = this.db
      .select({
        placeId: collectionPlace.placeId,
        seq: collectionPlace.seq,
        imageUrl: places.imageUrl,
        visited,
      })
      .from(collectionPlace)
      .innerJoin(places, eq(places.id, collectionPlace.placeId));
    const joined = userId
      ? q.leftJoin(visits, and(eq(visits.placeId, collectionPlace.placeId), eq(visits.userId, userId)))
      : q;
    return joined
      .where(and(...conds))
      .orderBy(asc(collectionPlace.seq), asc(collectionPlace.placeId))
      .limit(limit + 1);
  }

  /** all = 소속 수, visited = 그중 이 유저 방문 수(게스트 0). */
  async collectionCounts(
    collectionId: string,
    userId: string | null,
  ): Promise<{ all: number; visited: number }> {
    const [{ value: all }] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(collectionPlace)
      .where(eq(collectionPlace.collectionId, collectionId));
    let visited = 0;
    if (userId) {
      const [{ value }] = await this.db
        .select({ value: sql<number>`count(*)::int` })
        .from(collectionPlace)
        .innerJoin(visits, and(eq(visits.placeId, collectionPlace.placeId), eq(visits.userId, userId)))
        .where(eq(collectionPlace.collectionId, collectionId));
      visited = Number(value);
    }
    return { all: Number(all), visited };
  }
}
```

- [ ] **Step 4: Service 작성 (상세)**

Create `src/modules/collections/collections.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { IdService } from '@platform/id/id.service';
import { DogamService } from '@modules/dogam/dogam.service';
import { CollectionsRepository } from './collections.repository';
import { decodeSeqCursor, buildSeqPage } from './collections.cursor';

type Locale = (typeof localeEnum.enumValues)[number];

export interface CollectionDetailItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: string | null;
  visitStatus: 'VISITED' | 'NONE';
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly repo: CollectionsRepository,
    private readonly dogam: DogamService,
    private readonly id: IdService,
  ) {}

  async getCollectionDetail(
    id: string,
    locale: Locale,
    userId: string | null,
    cursor?: string,
    limit?: number,
  ): Promise<{
    id: string;
    title: string;
    description: string | null;
    counts: { all: number; visited: number };
    items: CollectionDetailItem[];
    nextCursor: string | null;
  }> {
    const found = await this.repo.getActiveCollection(id);
    if (!found) throw new NotFoundException('Collection not found');
    const lim = Math.min(Math.max(limit ?? 20, 1), 100);

    const [trans, counts, rows] = await Promise.all([
      this.repo.collectionTrans([id], [locale, 'KO']),
      this.repo.collectionCounts(id, userId),
      this.repo.detailPlacesPage(id, userId, decodeSeqCursor(cursor), lim),
    ]);
    const t = this.pickTrans(trans, locale);
    const page = buildSeqPage(rows, lim, (r) => ({ seq: r.seq, id: r.placeId }));
    const names = await this.repo.placeTransForMany(
      page.items.map((r) => r.placeId),
      [locale, 'KO'],
    );
    const items: CollectionDetailItem[] = page.items.map((r) => {
      const pt = this.pickPlaceName(names.filter((x) => x.placeId === r.placeId), locale);
      return {
        placeId: r.placeId,
        name: pt?.name ?? '',
        address: pt?.address ?? null,
        imageUrl: r.imageUrl ?? null,
        visitStatus: r.visited ? 'VISITED' : 'NONE',
      };
    });
    return {
      id,
      title: t?.title ?? '',
      description: t?.description ?? null,
      counts,
      items,
      nextCursor: page.nextCursor,
    };
  }

  private pickTrans(
    trans: { locale: string; title: string; description: string | null }[],
    locale: Locale,
  ) {
    return trans.find((t) => t.locale === locale) ?? trans.find((t) => t.locale === 'KO');
  }

  private pickPlaceName(
    names: { locale: string; name: string; address: string | null }[],
    locale: Locale,
  ) {
    return names.find((n) => n.locale === locale) ?? names.find((n) => n.locale === 'KO');
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test -- collections.service.spec`
Expected: PASS (3/3).

- [ ] **Step 6: DTO 작성**

Create `src/modules/collections/dto/collection.dto.ts`:
```ts
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CollectionDetailQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}
```

- [ ] **Step 7: 공개 컨트롤러 작성**

Create `src/modules/collections/collections.controller.ts`:
```ts
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { CollectionsService } from './collections.service';
import { CollectionDetailQueryDto } from './dto/collection.dto';

@ApiTags('collections')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** 테마 상세 — 소속 장소 목록(수집 여부 포함), cursor. */
  @ApiOperation({ summary: '테마 상세 (장소 목록)' })
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @OptionalUser() user: AuthUser | null,
    @Query() q: CollectionDetailQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.collections.getCollectionDetail(id, ctx.locale, user?.userId ?? null, q.cursor, q.limit);
  }
}
```

- [ ] **Step 8: 모듈 작성 + 등록**

Create `src/modules/collections/collections.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { CollectionsRepository } from './collections.repository';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';

@Module({
  imports: [AuthModule, DogamModule], // OptionalJwtAuthGuard, DogamService(regions)
  providers: [CollectionsRepository, CollectionsService],
  controllers: [CollectionsController],
})
export class CollectionsModule {}
```

`src/app.module.ts`를 열어 기존 모듈 import 목록(예: `DogamModule`, `HomeModule` 등) 옆에 `CollectionsModule`을 import하고 `@Module({ imports: [...] })` 배열에 추가한다:
```ts
import { CollectionsModule } from '@modules/collections/collections.module';
// ... imports: [ ..., CollectionsModule ]
```

- [ ] **Step 9: 빌드 + 전체 테스트**

Run: `pnpm build && pnpm test`
Expected: 성공, 전 스위트 PASS. (DogamModule은 DogamService를 export함 — CollectionsModule에서 주입 가능.)

- [ ] **Step 10: 커밋**
```bash
git add src/modules/collections src/app.module.ts
git commit -m "feat(collections): collection detail endpoint GET /collections/:id"
```

---

## Task 4: 테마별 탭 (GET /me/dogam/themes)

**Files:**
- Modify: `src/modules/collections/collections.repository.ts`
- Modify: `src/modules/collections/collections.service.ts`
- Create: `src/modules/collections/me-collections.controller.ts`
- Modify: `src/modules/collections/dto/collection.dto.ts`
- Modify: `src/modules/collections/collections.module.ts`
- Test: `src/modules/collections/collections.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 커서, Task 3 repo/service.
- Produces:
  - Repo: `themesPage(cursor, limit)`, `themeProgress(userId, ids)`, `themeThumbnails(ids)`.
  - Service: `listThemesWithProgress(userId, locale, cursor?, limit?)` → `{ items:[{collectionId,title,filled,total,thumbnails[]}], nextCursor }`, private `buildThemeCards(userId, locale, rows)`.

- [ ] **Step 1: 실패 테스트 작성**

`collections.service.spec.ts`의 repo 목에 메서드 추가:
```ts
      themesPage: jest.fn(),
      themeProgress: jest.fn(),
      themeThumbnails: jest.fn(),
```
새 describe 추가:
```ts
  describe('listThemesWithProgress', () => {
    it('maps theme cards with progress + thumbnails; nextCursor from seq', async () => {
      repo.themesPage.mockResolvedValue([
        { id: 'c1', seq: 1 },
        { id: 'c2', seq: 2 },
      ]);
      repo.collectionTrans.mockResolvedValue([
        { collectionId: 'c1', locale: 'KO', title: '동해 명소', description: null },
        { collectionId: 'c2', locale: 'KO', title: '등대 순례', description: null },
      ]);
      repo.themeProgress.mockResolvedValue(
        new Map([
          ['c1', { filled: 3, total: 8 }],
          ['c2', { filled: 0, total: 5 }],
        ]),
      );
      repo.themeThumbnails.mockResolvedValue(new Map([['c1', ['http://tong/a.jpg']], ['c2', []]]));

      const out = await service.listThemesWithProgress('u1', 'KO', undefined, 1);

      expect(repo.themesPage).toHaveBeenCalledWith(null, 2); // limit+1
      expect(out.items).toEqual([
        { collectionId: 'c1', title: '동해 명소', filled: 3, total: 8, thumbnails: ['http://tong/a.jpg'] },
      ]);
      expect(out.nextCursor).not.toBeNull();
    });

    it('empty themes → empty page', async () => {
      repo.themesPage.mockResolvedValue([]);
      const out = await service.listThemesWithProgress('u1', 'KO', undefined, 20);
      expect(out).toEqual({ items: [], nextCursor: null });
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- collections.service.spec`
Expected: FAIL (`listThemesWithProgress` 없음).

- [ ] **Step 3: Repository 메서드 추가**

`collections.repository.ts`에 import 보강 — 상단 import에 `desc`가 필요하면 추가(현재 `and, asc, eq, gt, inArray, or, sql`). `themesPage`는 asc만 쓰므로 추가 불필요. 다음 메서드를 클래스에 추가:
```ts
  /** ACTIVE 테마 keyset(seq ASC, id ASC). limit+1 조회. */
  async themesPage(
    cursor: { seq: number; id: string } | null,
    limit: number,
  ): Promise<{ id: string; seq: number }[]> {
    const conds: SQL[] = [eq(collections.status, 'ACTIVE')];
    if (cursor) {
      conds.push(
        or(
          gt(collections.seq, cursor.seq),
          and(eq(collections.seq, cursor.seq), gt(collections.id, cursor.id)),
        )!,
      );
    }
    return this.db
      .select({ id: collections.id, seq: collections.seq })
      .from(collections)
      .where(and(...conds))
      .orderBy(asc(collections.seq), asc(collections.id))
      .limit(limit + 1);
  }

  /** 테마별 {filled(방문 수), total(소속 수)}. */
  async themeProgress(
    userId: string,
    ids: string[],
  ): Promise<Map<string, { filled: number; total: number }>> {
    const map = new Map<string, { filled: number; total: number }>();
    if (ids.length === 0) return map;
    const totals = await this.db
      .select({ cid: collectionPlace.collectionId, total: sql<number>`count(*)::int` })
      .from(collectionPlace)
      .where(inArray(collectionPlace.collectionId, ids))
      .groupBy(collectionPlace.collectionId);
    const filled = await this.db
      .select({ cid: collectionPlace.collectionId, filled: sql<number>`count(*)::int` })
      .from(collectionPlace)
      .innerJoin(visits, and(eq(visits.placeId, collectionPlace.placeId), eq(visits.userId, userId)))
      .where(inArray(collectionPlace.collectionId, ids))
      .groupBy(collectionPlace.collectionId);
    for (const id of ids) map.set(id, { filled: 0, total: 0 });
    for (const r of totals) map.set(r.cid, { filled: 0, total: Number(r.total) });
    for (const r of filled) {
      const cur = map.get(r.cid) ?? { filled: 0, total: 0 };
      map.set(r.cid, { filled: Number(r.filled), total: cur.total });
    }
    return map;
  }

  /** 테마별 소속 place image_url 앞 4개(seq ASC, place_id ASC, null 제외). */
  async themeThumbnails(ids: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;
    for (const id of ids) map.set(id, []);
    const rows = await this.db
      .select({ cid: collectionPlace.collectionId, imageUrl: places.imageUrl, seq: collectionPlace.seq, pid: collectionPlace.placeId })
      .from(collectionPlace)
      .innerJoin(places, eq(places.id, collectionPlace.placeId))
      .where(and(inArray(collectionPlace.collectionId, ids), sql`${places.imageUrl} is not null`))
      .orderBy(asc(collectionPlace.seq), asc(collectionPlace.placeId));
    for (const r of rows) {
      const arr = map.get(r.cid)!;
      if (arr.length < 4 && r.imageUrl) arr.push(r.imageUrl);
    }
    return map;
  }
```

- [ ] **Step 4: Service 메서드 추가**

`collections.service.ts` 상단 import에 커서 인코딩 추가:
```ts
import { decodeSeqCursor, buildSeqPage, encodeSeqCursor } from './collections.cursor';
```
(`encodeSeqCursor`는 buildThemeCards의 nextCursor에 쓰지 않고 buildSeqPage가 처리하므로 실제로는 불필요하면 넣지 말 것 — buildSeqPage만 사용.) 인터페이스와 메서드 추가:
```ts
export interface ThemeCard {
  collectionId: string;
  title: string;
  filled: number;
  total: number;
  thumbnails: string[];
}

// (클래스 내부)
  async listThemesWithProgress(
    userId: string,
    locale: Locale,
    cursor?: string,
    limit?: number,
  ): Promise<{ items: ThemeCard[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(limit ?? 20, 1), 100);
    const rows = await this.repo.themesPage(decodeSeqCursor(cursor), lim);
    const page = buildSeqPage(rows, lim, (r) => ({ seq: r.seq, id: r.id }));
    const cards = await this.buildThemeCards(userId, locale, page.items);
    return { items: cards, nextCursor: page.nextCursor };
  }

  /** {id,seq} 테마 rows → 진행률·썸네일·title 결합한 카드. themes/collections 공용. */
  private async buildThemeCards(
    userId: string,
    locale: Locale,
    rows: { id: string; seq: number }[],
  ): Promise<ThemeCard[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [trans, progress, thumbs] = await Promise.all([
      this.repo.collectionTrans(ids, [locale, 'KO']),
      this.repo.themeProgress(userId, ids),
      this.repo.themeThumbnails(ids),
    ]);
    return rows.map((r) => {
      const t = this.pickTrans(trans.filter((x) => x.collectionId === r.id), locale);
      const p = progress.get(r.id) ?? { filled: 0, total: 0 };
      return {
        collectionId: r.id,
        title: t?.title ?? '',
        filled: p.filled,
        total: p.total,
        thumbnails: thumbs.get(r.id) ?? [],
      };
    });
  }
```
(주의: `encodeSeqCursor`를 실제로 안 쓰면 import에서 빼서 no-unused 경고를 피할 것.)

- [ ] **Step 5: 통과 확인**

Run: `pnpm test -- collections.service.spec`
Expected: PASS (기존 상세 3 + 신규 2).

- [ ] **Step 6: DTO 추가**

`dto/collection.dto.ts`에 추가:
```ts
export class ThemesQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}
```

- [ ] **Step 7: me 컨트롤러 작성 (themes)**

Create `src/modules/collections/me-collections.controller.ts`:
```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { ReqContext } from '@platform/context/req-context.decorator';
import type { RequestContext } from '@platform/context/request-context';
import { CollectionsService } from './collections.service';
import { ThemesQueryDto } from './dto/collection.dto';

@ApiTags('collections')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class MeCollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** 도감 테마별 탭 — 테마 컬렉션 진행률. */
  @ApiOperation({ summary: '도감 테마별 탭' })
  @Get('me/dogam/themes')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  themes(
    @CurrentUser() user: AuthUser,
    @Query() q: ThemesQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.collections.listThemesWithProgress(user.userId, ctx.locale, q.cursor, q.limit);
  }
}
```

- [ ] **Step 8: 모듈에 컨트롤러 등록**

`collections.module.ts`의 `controllers` 배열에 `MeCollectionsController` 추가(import도):
```ts
import { MeCollectionsController } from './me-collections.controller';
// controllers: [CollectionsController, MeCollectionsController],
```

- [ ] **Step 9: 빌드 + 전체 테스트**

Run: `pnpm build && pnpm test`
Expected: 성공, 전 스위트 PASS.

- [ ] **Step 10: 커밋**
```bash
git add src/modules/collections
git commit -m "feat(collections): themes tab GET /me/dogam/themes with progress + thumbnails"
```

---

## Task 5: 마이 진행률 합본 (GET /me/collections)

**Files:**
- Modify: `src/modules/collections/collections.repository.ts`
- Modify: `src/modules/collections/collections.service.ts`
- Modify: `src/modules/collections/me-collections.controller.ts`
- Modify: `src/modules/collections/dto/collection.dto.ts`
- Test: `src/modules/collections/collections.service.spec.ts`

**Interfaces:**
- Consumes: Task 2 병합 커서, Task 4 `buildThemeCards`/`themesPage`, `DogamService.regions(userId, locale): Promise<{sidoCode, name, percent, collected, total, locked}[]>`.
- Produces:
  - Repo: `regionThumbnails(codes: string[])`, `anyActiveTheme()`.
  - Service: `listMyCollections(userId, locale, cursor?, limit?)` →
    `{ items:[{kind:'REGION'|'THEME', id, title, filled, total, thumbnails[]}], nextCursor }`.

- [ ] **Step 1: 실패 테스트 작성**

`collections.service.spec.ts` repo 목에 추가:
```ts
      regionThumbnails: jest.fn(),
      anyActiveTheme: jest.fn(),
```
새 describe:
```ts
  describe('listMyCollections', () => {
    const regionCards = [
      { sidoCode: '11', name: '서울', percent: 50, collected: 5, total: 10, locked: false },
      { sidoCode: '32', name: '강원', percent: 40, collected: 4, total: 10, locked: false },
    ];

    it('regions first then themes, with kind; page spans boundary', async () => {
      dogam.regions.mockResolvedValue(regionCards);
      repo.regionThumbnails.mockResolvedValue(new Map([['11', ['http://tong/s.jpg']], ['32', []]]));
      // limit 3: 2 regions + 1 theme
      repo.themesPage.mockResolvedValue([{ id: 'c1', seq: 1 }]); // remaining=1, +1 → returns ≤2; here 1 (no next)
      repo.collectionTrans.mockResolvedValue([{ collectionId: 'c1', locale: 'KO', title: '동해', description: null }]);
      repo.themeProgress.mockResolvedValue(new Map([['c1', { filled: 2, total: 6 }]]));
      repo.themeThumbnails.mockResolvedValue(new Map([['c1', []]]));

      const out = await service.listMyCollections('u1', 'KO', undefined, 3);

      expect(out.items).toEqual([
        { kind: 'REGION', id: '11', title: '서울', filled: 5, total: 10, thumbnails: ['http://tong/s.jpg'] },
        { kind: 'REGION', id: '32', title: '강원', filled: 4, total: 10, thumbnails: [] },
        { kind: 'THEME', id: 'c1', title: '동해', filled: 2, total: 6, thumbnails: [] },
      ]);
      expect(out.nextCursor).toBeNull();
    });

    it('page full on regions → nextCursor is region marker (more exist)', async () => {
      dogam.regions.mockResolvedValue(regionCards);
      repo.regionThumbnails.mockResolvedValue(new Map([['11', []]]));
      repo.anyActiveTheme.mockResolvedValue(true);

      const out = await service.listMyCollections('u1', 'KO', undefined, 1);

      expect(out.items).toEqual([
        { kind: 'REGION', id: '11', title: '서울', filled: 5, total: 10, thumbnails: [] },
      ]);
      expect(out.nextCursor).not.toBeNull(); // more regions remain
      expect(repo.themesPage).not.toHaveBeenCalled();
    });

    it('THEME cursor skips regions entirely', async () => {
      repo.themesPage.mockResolvedValue([{ id: 'c2', seq: 5 }]);
      repo.collectionTrans.mockResolvedValue([{ collectionId: 'c2', locale: 'KO', title: '등대', description: null }]);
      repo.themeProgress.mockResolvedValue(new Map([['c2', { filled: 1, total: 3 }]]));
      repo.themeThumbnails.mockResolvedValue(new Map([['c2', []]]));
      const { encodeMergedTheme } = await import('./collections.cursor');

      const out = await service.listMyCollections('u1', 'KO', encodeMergedTheme(4, 'c1'), 20);

      expect(dogam.regions).not.toHaveBeenCalled();
      expect(out.items).toEqual([{ kind: 'THEME', id: 'c2', title: '등대', filled: 1, total: 3, thumbnails: [] }]);
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- collections.service.spec`
Expected: FAIL (`listMyCollections` 없음).

- [ ] **Step 3: Repository 메서드 추가**

`collections.repository.ts`에 메서드 추가(raw SQL window function — region place가 많아 상위 4개만):
```ts
  /** province 코드별(region_code 접두) 소속 place image_url 앞 4개. */
  async regionThumbnails(codes: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (codes.length === 0) return map;
    for (const c of codes) map.set(c, []);
    const rows = await this.db.execute<{ prov: string; image_url: string }>(sql`
      SELECT prov, image_url FROM (
        SELECT split_part(region_code, '_', 1) AS prov, image_url,
               row_number() OVER (PARTITION BY split_part(region_code, '_', 1) ORDER BY id ASC) AS rn
        FROM ${places}
        WHERE status = 'ACTIVE' AND image_url IS NOT NULL
          AND split_part(region_code, '_', 1) = ANY(${codes})
      ) t WHERE rn <= 4
      ORDER BY prov, rn
    `);
    for (const r of rows) {
      const arr = map.get(r.prov);
      if (arr) arr.push(r.image_url);
    }
    return map;
  }

  /** ACTIVE 테마가 하나라도 있는지. */
  async anyActiveTheme(): Promise<boolean> {
    const [row] = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.status, 'ACTIVE'))
      .limit(1);
    return !!row;
  }
```

- [ ] **Step 4: Service 메서드 추가**

`collections.service.ts` 상단 import에 병합 커서 추가:
```ts
import {
  decodeSeqCursor,
  buildSeqPage,
  decodeMergedCursor,
  encodeMergedRegion,
  encodeMergedTheme,
} from './collections.cursor';
```
인터페이스 + 메서드:
```ts
export interface MyCollectionItem {
  kind: 'REGION' | 'THEME';
  id: string;
  title: string;
  filled: number;
  total: number;
  thumbnails: string[];
}

// (클래스 내부)
  async listMyCollections(
    userId: string,
    locale: Locale,
    cursor?: string,
    limit?: number,
  ): Promise<{ items: MyCollectionItem[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(limit ?? 20, 1), 100);
    const c = decodeMergedCursor(cursor);
    const items: MyCollectionItem[] = [];

    // --- REGION phase (cursor 없음 또는 REGION일 때만) ---
    if (!c || c.kind === 'REGION') {
      const regionCards = await this.dogam.regions(userId, locale); // 17, code 정렬
      const afterCode = c && c.kind === 'REGION' ? c.code : null;
      const startIdx = afterCode
        ? regionCards.findIndex((r) => Number(r.sidoCode) > Number(afterCode))
        : 0;
      const slice = startIdx === -1 ? [] : regionCards.slice(startIdx, startIdx + lim);
      if (slice.length > 0) {
        const thumbs = await this.repo.regionThumbnails(slice.map((r) => r.sidoCode));
        for (const r of slice) {
          items.push({
            kind: 'REGION',
            id: r.sidoCode,
            title: r.name,
            filled: r.collected,
            total: r.total,
            thumbnails: thumbs.get(r.sidoCode) ?? [],
          });
        }
      }
      const consumedThroughIdx = startIdx === -1 ? regionCards.length : startIdx + slice.length;
      const regionsExhausted = consumedThroughIdx >= regionCards.length;

      if (items.length >= lim) {
        // 페이지가 지역으로 꽉 참 → 마지막 지역 마커. 뒤에 더 있으면(지역 남음 or 테마 존재) 커서 반환.
        const last = slice[slice.length - 1];
        const more = !regionsExhausted || (await this.repo.anyActiveTheme());
        return { items, nextCursor: more ? encodeMergedRegion(last.sidoCode) : null };
      }
      // 지역이 페이지를 못 채움 → 테마 앞부분으로 이어감(themeCursor 없음)
    }

    // --- THEME phase ---
    const remaining = lim - items.length;
    const themeCursor = c && c.kind === 'THEME' ? { seq: c.seq, id: c.id } : null;
    const rows = await this.repo.themesPage(themeCursor, remaining);
    const hasNext = rows.length > remaining;
    const pageRows = hasNext ? rows.slice(0, remaining) : rows;
    const cards = await this.buildThemeCards(userId, locale, pageRows);
    for (const card of cards) {
      items.push({
        kind: 'THEME',
        id: card.collectionId,
        title: card.title,
        filled: card.filled,
        total: card.total,
        thumbnails: card.thumbnails,
      });
    }
    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasNext && last ? encodeMergedTheme(last.seq, last.id) : null;
    return { items, nextCursor };
  }
```
(주의: `themesPage(themeCursor, remaining)`는 내부에서 `remaining + 1`을 조회하므로 여기서 `remaining`을 그대로 넘기고, 반환 rows를 `remaining` 기준으로 hasNext 판정한다. 즉 Task 4의 themesPage 시그니처(limit → limit+1 조회)와 일치.)

- [ ] **Step 5: 통과 확인**

Run: `pnpm test -- collections.service.spec`
Expected: PASS (상세 3 + themes 2 + collections 3).

- [ ] **Step 6: DTO + 라우트 추가**

`dto/collection.dto.ts`에 추가:
```ts
export class MyCollectionsQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}
```
`me-collections.controller.ts`에 라우트 추가(import에 `MyCollectionsQueryDto` 포함):
```ts
  /** 마이페이지 도감 진행률 탭 — 지역+테마 합본. */
  @ApiOperation({ summary: '도감 진행률(지역+테마 합본)' })
  @Get('me/collections')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  myCollections(
    @CurrentUser() user: AuthUser,
    @Query() q: MyCollectionsQueryDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.collections.listMyCollections(user.userId, ctx.locale, q.cursor, q.limit);
  }
```

- [ ] **Step 7: 빌드 + 전체 테스트**

Run: `pnpm build && pnpm test`
Expected: 성공, 전 스위트 PASS.

- [ ] **Step 8: 커밋**
```bash
git add src/modules/collections
git commit -m "feat(collections): merged region+theme progress GET /me/collections"
```

---

## Task 6: 어드민 큐레이션 CRUD

**Files:**
- Modify: `src/modules/collections/collections.repository.ts`
- Modify: `src/modules/collections/collections.service.ts`
- Create: `src/modules/collections/admin-collections.controller.ts`
- Modify: `src/modules/collections/dto/collection.dto.ts`
- Modify: `src/modules/collections/collections.module.ts`
- Test: `src/modules/collections/collections.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 스키마, `IdService`.
- Produces:
  - Repo: `collectionExists(id)`, `placeActive(placeId)`, `create(input, trans)`, `updateMeta(id, patch)`, `deleteById(id)`, `addPlace(collectionId, placeId, seq)`, `removePlace(collectionId, placeId)`, `adminListPage({limit, offset})`.
  - Service: `adminCreate`, `adminList`, `adminUpdate`, `adminDelete`, `adminAddPlace`, `adminRemovePlace`.

- [ ] **Step 1: 실패 테스트 작성**

`collections.service.spec.ts` repo 목에 추가:
```ts
      collectionExists: jest.fn(),
      placeActive: jest.fn(),
      create: jest.fn(),
      updateMeta: jest.fn(),
      deleteById: jest.fn(),
      addPlace: jest.fn(),
      removePlace: jest.fn(),
      adminListPage: jest.fn(),
```
새 describe:
```ts
  describe('admin', () => {
    it('adminCreate requires KO translation', async () => {
      await expect(
        service.adminCreate({ seq: 1, translations: [{ locale: 'EN', title: 'x' }] }),
      ).rejects.toThrow('KO translation is required');
    });

    it('adminCreate inserts and returns generated id', async () => {
      repo.create.mockResolvedValue(undefined);
      const out = await service.adminCreate({
        seq: 2,
        status: 'ACTIVE',
        translations: [{ locale: 'KO', title: '동해 명소', description: '설명' }],
      });
      expect(out).toEqual({ collectionId: 'id-1' });
      const [input, trans] = repo.create.mock.calls[0];
      expect(input).toEqual({ id: 'id-1', seq: 2, status: 'ACTIVE' });
      expect(trans).toEqual([{ locale: 'KO', title: '동해 명소', description: '설명' }]);
    });

    it('adminUpdate 404 when missing', async () => {
      repo.updateMeta.mockResolvedValue(null);
      await expect(service.adminUpdate('c1', { seq: 3 })).rejects.toThrow('Collection not found');
    });

    it('adminDelete 404 when missing', async () => {
      repo.deleteById.mockResolvedValue(false);
      await expect(service.adminDelete('c1')).rejects.toThrow('Collection not found');
    });

    it('adminAddPlace 404 when collection missing', async () => {
      repo.collectionExists.mockResolvedValue(false);
      await expect(service.adminAddPlace('c1', 'p1', 1)).rejects.toThrow('Collection not found');
    });

    it('adminAddPlace 404 when place not ACTIVE', async () => {
      repo.collectionExists.mockResolvedValue(true);
      repo.placeActive.mockResolvedValue(false);
      await expect(service.adminAddPlace('c1', 'p1', 1)).rejects.toThrow('Place not found');
    });

    it('adminAddPlace upserts membership', async () => {
      repo.collectionExists.mockResolvedValue(true);
      repo.placeActive.mockResolvedValue(true);
      repo.addPlace.mockResolvedValue(undefined);
      await service.adminAddPlace('c1', 'p1', 5);
      expect(repo.addPlace).toHaveBeenCalledWith('c1', 'p1', 5);
    });

    it('adminRemovePlace 404 when membership missing', async () => {
      repo.removePlace.mockResolvedValue(false);
      await expect(service.adminRemovePlace('c1', 'p1')).rejects.toThrow('Membership not found');
    });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test -- collections.service.spec`
Expected: FAIL (admin 메서드 없음).

- [ ] **Step 3: Repository 메서드 추가**

`collections.repository.ts`에 추가. 상단 import에 `placeStatusEnum`는 불필요, 하지만 `collectionPlace`/`collections`/`places`는 이미 있음. 트랜잭션 create·upsert 추가:
```ts
  async collectionExists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: collections.id }).from(collections).where(eq(collections.id, id));
    return !!row;
  }

  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  async create(
    input: { id: string; seq: number; status: 'ACTIVE' | 'HIDDEN' },
    trans: { locale: string; title: string; description: string | null }[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(collections).values({ id: input.id, seq: input.seq, status: input.status });
      await tx.insert(collectionTrans).values(
        trans.map((t) => ({
          collectionId: input.id,
          locale: t.locale as (typeof localeEnum.enumValues)[number],
          title: t.title,
          description: t.description,
        })),
      );
    });
  }

  async updateMeta(
    id: string,
    patch: { seq?: number; status?: 'ACTIVE' | 'HIDDEN' },
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .update(collections)
      .set({
        ...(patch.seq !== undefined ? { seq: patch.seq } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(collections.id, id))
      .returning({ id: collections.id });
    return row ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(collections).where(eq(collections.id, id)).returning({ id: collections.id });
    return rows.length > 0;
  }

  /** 멤버십 upsert (중복 시 seq 갱신). */
  async addPlace(collectionId: string, placeId: string, seq: number): Promise<void> {
    await this.db
      .insert(collectionPlace)
      .values({ collectionId, placeId, seq })
      .onConflictDoUpdate({ target: [collectionPlace.collectionId, collectionPlace.placeId], set: { seq } });
  }

  async removePlace(collectionId: string, placeId: string): Promise<boolean> {
    const rows = await this.db
      .delete(collectionPlace)
      .where(and(eq(collectionPlace.collectionId, collectionId), eq(collectionPlace.placeId, placeId)))
      .returning({ pid: collectionPlace.placeId });
    return rows.length > 0;
  }

  /** 어드민 offset 목록(seq ASC) + total + 소속 수 + KO/폴백 title. */
  async adminListPage(params: {
    limit: number;
    offset: number;
  }): Promise<{ rows: { id: string; seq: number; status: string; title: string; total: number }[]; total: number }> {
    const base = await this.db
      .select({ id: collections.id, seq: collections.seq, status: collections.status })
      .from(collections)
      .orderBy(asc(collections.seq), asc(collections.id))
      .limit(params.limit)
      .offset(params.offset);
    const [{ value }] = await this.db.select({ value: sql<number>`count(*)::int` }).from(collections);
    const ids = base.map((r) => r.id);
    const titles = await this.collectionTrans(ids, [...(['KO'] as (typeof localeEnum.enumValues)[number][])]);
    const counts =
      ids.length === 0
        ? []
        : await this.db
            .select({ cid: collectionPlace.collectionId, total: sql<number>`count(*)::int` })
            .from(collectionPlace)
            .where(inArray(collectionPlace.collectionId, ids))
            .groupBy(collectionPlace.collectionId);
    const countMap = new Map(counts.map((c) => [c.cid, Number(c.total)]));
    const titleMap = new Map(titles.map((t) => [t.collectionId, t.title]));
    return {
      rows: base.map((r) => ({
        id: r.id,
        seq: r.seq,
        status: r.status,
        title: titleMap.get(r.id) ?? '',
        total: countMap.get(r.id) ?? 0,
      })),
      total: Number(value),
    };
  }
```
(주의: `localeEnum`을 값으로 쓰려면 상단 import에서 `type localeEnum` → 값 import로 바꾼다: `import { collections, collectionTrans, collectionPlace, places, placeTrans, visits, localeEnum } from '@db/schema';` 그리고 `type Locale = (typeof localeEnum.enumValues)[number];`는 유지.)

- [ ] **Step 4: Service 메서드 추가**

`collections.service.ts`에 어드민 메서드 추가(`BadRequestException` import 추가):
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
```
```ts
  async adminCreate(cmd: {
    seq: number;
    status?: 'ACTIVE' | 'HIDDEN';
    translations: { locale: string; title: string; description?: string }[];
  }): Promise<{ collectionId: string }> {
    if (!cmd.translations.some((t) => t.locale === 'KO')) {
      throw new BadRequestException('KO translation is required');
    }
    const collectionId = this.id.generate();
    await this.repo.create(
      { id: collectionId, seq: cmd.seq, status: cmd.status ?? 'ACTIVE' },
      cmd.translations.map((t) => ({ locale: t.locale, title: t.title, description: t.description ?? null })),
    );
    return { collectionId };
  }

  async adminList(params: { page: number; limit: number }) {
    const { rows, total } = await this.repo.adminListPage({
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
    });
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async adminUpdate(id: string, patch: { seq?: number; status?: 'ACTIVE' | 'HIDDEN' }): Promise<{ id: string }> {
    const row = await this.repo.updateMeta(id, patch);
    if (!row) throw new NotFoundException('Collection not found');
    return row;
  }

  async adminDelete(id: string): Promise<void> {
    const ok = await this.repo.deleteById(id);
    if (!ok) throw new NotFoundException('Collection not found');
  }

  async adminAddPlace(collectionId: string, placeId: string, seq: number): Promise<void> {
    if (!(await this.repo.collectionExists(collectionId))) throw new NotFoundException('Collection not found');
    if (!(await this.repo.placeActive(placeId))) throw new NotFoundException('Place not found');
    await this.repo.addPlace(collectionId, placeId, seq);
  }

  async adminRemovePlace(collectionId: string, placeId: string): Promise<void> {
    const ok = await this.repo.removePlace(collectionId, placeId);
    if (!ok) throw new NotFoundException('Membership not found');
  }
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test -- collections.service.spec`
Expected: PASS (전체).

- [ ] **Step 6: DTO 추가**

`dto/collection.dto.ts`에 추가:
```ts
const collectionTranslation = z.object({
  locale: z.enum(['KO', 'EN', 'JA', 'ZH']),
  title: z.string().min(1),
  description: z.string().optional(),
});

export class CreateCollectionDto extends createZodDto(
  z.object({
    seq: z.coerce.number().int().min(0),
    status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
    translations: z
      .array(collectionTranslation)
      .min(1)
      .superRefine((arr, ctx) => {
        const seen = new Set<string>();
        for (const t of arr) {
          if (seen.has(t.locale)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate locale: ${t.locale}` });
          }
          seen.add(t.locale);
        }
      }),
  }),
) {}

export class UpdateCollectionDto extends createZodDto(
  z.object({
    seq: z.coerce.number().int().min(0).optional(),
    status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
  }),
) {}

export class AddCollectionPlaceDto extends createZodDto(
  z.object({
    placeId: z.string().uuid(),
    seq: z.coerce.number().int().min(0),
  }),
) {}

export class AdminCollectionListQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}
```

- [ ] **Step 7: 어드민 컨트롤러 작성**

Create `src/modules/collections/admin-collections.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminJwtGuard } from '@modules/admin/guards/admin-jwt.guard';
import { AdminRolesGuard } from '@modules/admin/guards/admin-roles.guard';
import { AdminRoles } from '@modules/admin/decorators/admin-roles.decorator';
import { CollectionsService } from './collections.service';
import {
  AddCollectionPlaceDto,
  AdminCollectionListQueryDto,
  CreateCollectionDto,
  UpdateCollectionDto,
} from './dto/collection.dto';

/** 테마 컬렉션 큐레이션 (어드민). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/collections')
@UseGuards(AdminJwtGuard, AdminRolesGuard)
@AdminRoles('SUPER_ADMIN', 'ADMIN')
export class AdminCollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @ApiOperation({ summary: '테마 등록 (어드민)' })
  @Post()
  create(@Body() dto: CreateCollectionDto) {
    return this.collections.adminCreate(dto);
  }

  @ApiOperation({ summary: '테마 목록 (어드민, offset)' })
  @Get()
  list(@Query() q: AdminCollectionListQueryDto) {
    return this.collections.adminList(q);
  }

  @ApiOperation({ summary: '테마 수정 (seq/status)' })
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionDto) {
    return this.collections.adminUpdate(id, dto);
  }

  @ApiOperation({ summary: '테마 삭제' })
  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.collections.adminDelete(id);
    return { deleted: true };
  }

  @ApiOperation({ summary: '테마에 장소 추가' })
  @Post(':id/places')
  async addPlace(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCollectionPlaceDto) {
    await this.collections.adminAddPlace(id, dto.placeId, dto.seq);
    return { added: true };
  }

  @ApiOperation({ summary: '테마에서 장소 제거' })
  @Delete(':id/places/:placeId')
  async removePlace(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('placeId', ParseUUIDPipe) placeId: string,
  ) {
    await this.collections.adminRemovePlace(id, placeId);
    return { removed: true };
  }
}
```

- [ ] **Step 8: 모듈에 어드민 컨트롤러 + IdService/AdminModule 등록**

`collections.module.ts` 수정 — `AdminModule` import(어드민 가드), `AdminCollectionsController` 등록. `IdService`는 `@Global` IdModule로 제공되므로 별도 주입 불필요(다른 모듈처럼). AdminModule import 필요:
```ts
import { AdminModule } from '@modules/admin/admin.module';
import { AdminCollectionsController } from './admin-collections.controller';
// imports: [AuthModule, DogamModule, AdminModule],
// controllers: [CollectionsController, MeCollectionsController, AdminCollectionsController],
```
(IdService 주입이 안 되면 — 다른 모듈에서 IdService를 어떻게 얻는지 확인: `@platform/id`가 @Global이면 그대로 주입됨. PlacesService가 IdService를 생성자 주입하는 방식과 동일하게 CollectionsService도 이미 주입 중이므로 추가 설정 불필요.)

- [ ] **Step 9: 빌드 + 전체 테스트**

Run: `pnpm build && pnpm test`
Expected: 성공, 전 스위트 PASS.

- [ ] **Step 10: 커밋**
```bash
git add src/modules/collections
git commit -m "feat(collections): admin curation CRUD (collection + membership)"
```

---

## 최종 검증 (E2E, 수동)

1. `pnpm db:migrate` — collection 3테이블 반영.
2. 어드민 토큰으로 `POST /admin/collections`(KO title) → `POST /admin/collections/:id/places`(place 몇 개) 큐레이션.
3. `GET /api/collections/:id`(게스트) → 장소 목록 imageUrl·visitStatus NONE. 로그인+방문 → VISITED, counts.visited 반영.
4. `GET /api/me/dogam/themes`(로그인) → 테마 카드 filled/total/thumbnails.
5. `GET /api/me/collections`(로그인) → 지역 17 + 테마 N 합본, `kind` 부여, `nextCursor` 따라가며 지역→테마 경계 넘김 확인.
6. `PATCH`(seq/status HIDDEN) → themes/collections에서 사라짐. `DELETE` → trans·membership CASCADE.

---

## Notes / 스코프 이탈

- **어드민 PATCH는 seq·status만**(번역 수정 미포함) — 스펙대로. 번역 수정은 후속.
- **`user_collection_progress` 집계 테이블 없음** — 실시간 계산(스펙대로). place 카탈로그 커지면 후속 최적화.
- **지역 항목 상세**는 collections가 아니라 기존 `/regions/:code/places` 사용(중복 서빙 안 함).
- 썸네일 4개 고정. 커버 이미지·테마 잠금·좋아요는 후속.
