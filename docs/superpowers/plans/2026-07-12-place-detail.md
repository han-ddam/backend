# 여행지 상세 확장 + place 대표 이미지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** place에 TourAPI 대표 이미지를 도입하고, 여행지 상세에 방문상태·다른 여행자 인증사진 피드를 추가한다.

**Architecture:** `place` 테이블에 `image_url` 컬럼 1개를 더하고 기존 TourAPI 시드(`areaBasedList2`의 `firstimage`)에서 채운다. 지금 `null` 하드코딩인 imageUrl(regions 목록·추천, home discovery)을 실데이터로 바꾸고, `getPlace`를 확장(imageUrl·visitStatus·rating placeholder, OptionalJwt)한다. 인증사진 피드는 기존 certification(PUBLIC·ACCEPTED)을 재사용하는 신규 공개 엔드포인트다.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, drizzle-kit(마이그레이션), nestjs-zod DTO, Jest.

## Global Constraints

- 성공 응답은 `{ result: ... }`만 — 컨트롤러는 payload만 반환(전역 ResponseInterceptor가 감쌈).
- 이미지는 TourAPI 절대 URL 문자열을 **그대로 저장(핫링크)**. 업로드/StoragePort/새 테이블 없음.
- `visitStatus` enum은 `'VISITED' | 'NONE'` (기존 regions.service.ts:104와 통일 — PLANNED 없음).
- rating/ratingCount는 `null`/`0` placeholder (평점 집계는 후속).
- 커서 페이지네이션은 `@platform/pagination/cursor`의 `decodeCursor`/`buildCursorPage` 재사용(커서 = createdAt+id, 정렬 createdAt DESC·id DESC).
- 인증 피드 imageUrl = `/api/certifications/photos/{imageKey}` (기존 서빙 라우트가 PUBLIC은 게스트 허용).
- 서비스 단위 테스트는 repo를 순수 jest 목으로 주입(`new Service(mockRepo, ...)`). repository/컨트롤러/시드/마이그레이션은 빌드+수동 e2e로 검증(기존 관례 — repository 단위 테스트 없음).
- `@Param` UUID 검증은 `ParseUUIDPipe` 사용.

---

## File Structure

- `src/db/schema/places.ts` — `image_url` 컬럼 추가(Place 타입이 자동 확장 → findById가 imageUrl 포함).
- `src/db/migrations/00NN_*.sql` — drizzle-kit 생성(ALTER TABLE place ADD COLUMN image_url).
- `src/db/seeds/seed-places.ts` — areaBasedList2 `firstimage2`/`firstimage` 파싱 → image_url 적재.
- `src/modules/places/places.repository.ts` — `hasVisit(userId, placeId)` 추가.
- `src/modules/places/places.service.ts` — `PlaceView` 확장, `getPlace(id, locale, userId?)`.
- `src/modules/places/places.controller.ts` — `GET :id`에 OptionalJwt+UUID+userId, `GET :id/certifications` 피드 라우트.
- `src/modules/places/places.module.ts` — `CertificationsModule` import.
- `src/modules/places/dto/place.dto.ts` — `PlaceCertFeedQueryDto`.
- `src/modules/regions/regions.repository.ts` / `regions.service.ts` — imageUrl select + 매핑.
- `src/modules/home/home.repository.ts` / `home.service.ts` — imageUrl select + 매핑.
- `src/modules/certifications/certifications.repository.ts` — `publicFeedForPlace` 쿼리.
- `src/modules/certifications/certifications.service.ts` — `publicFeedForPlace` 서비스.

---

## Task 1: place.image_url 컬럼 + 마이그레이션 + 시드 적재

**Files:**
- Modify: `src/db/schema/places.ts` (places 테이블 정의)
- Create: `src/db/migrations/00NN_*.sql` (drizzle-kit generate 산출물)
- Modify: `src/db/seeds/seed-places.ts`

**Interfaces:**
- Produces: `places.imageUrl` 컬럼 → `Place` 타입에 `imageUrl: string | null` 자동 포함. 이후 모든 태스크가 `places.imageUrl` / `place.imageUrl`을 참조.

- [ ] **Step 1: 스키마에 image_url 컬럼 추가**

`src/db/schema/places.ts`의 `places` 테이블에서 `tags` 줄 다음에 컬럼을 추가한다(`text`는 이미 import됨):

```ts
  tags: text('tags').array().notNull().default([]),
  imageUrl: text('image_url'), // TourAPI firstimage URL (nullable, 핫링크)
  status: placeStatusEnum('status').notNull().default('ACTIVE'),
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm db:generate`
Expected: `src/db/migrations/`에 새 `.sql` 파일 생성. 내용에 다음이 포함되어야 한다:
```sql
ALTER TABLE "place" ADD COLUMN "image_url" text;
```
(파일을 열어 위 문장이 있는지 확인. `_journal.json`도 갱신됨.)

- [ ] **Step 3: 시드 파싱에 이미지 필드 추가**

`src/db/seeds/seed-places.ts`의 `PlaceItem` 인터페이스에 `image` 필드를 추가한다:

```ts
interface PlaceItem {
  contentId: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  areaCode: string | null;
  regionCode: string | null;
  image: string | null;
}
```

같은 파일 `fetchPage`의 `.map((i) => {...})` 반환 객체에 `image`를 추가한다(`regionCode` 줄 다음):

```ts
      return {
        contentId: String(i.contentid),
        title: String(i.title ?? '').trim(),
        address: i.addr1 ? String(i.addr1).trim() : null,
        lat: num(i.mapy),
        lng: num(i.mapx),
        areaCode: areacode,
        regionCode: areacode && sigungu ? `${areacode}_${sigungu}` : null,
        image:
          (i.firstimage2 && String(i.firstimage2).trim()) ||
          (i.firstimage && String(i.firstimage).trim()) ||
          null,
      };
```

- [ ] **Step 4: upsert에 image_url 반영**

`src/db/seeds/seed-places.ts`의 `upsertPlaceKo` 함수를 연다(대략 155~175행). `.insert(schema.places).values({...})`의 값 객체에 `imageUrl: p.image`를 추가하고, `.onConflictDoUpdate({ target, set: {...} })`의 `set` 객체에도 `imageUrl: p.image`를 추가한다. 예:

```ts
      const [row] = await db
        .insert(schema.places)
        .values({
          id: uuidv7(),
          regionCode: p.regionCode!,
          tourapiContentId: p.contentId,
          lat: p.lat,
          lng: p.lng,
          imageUrl: p.image,
        })
        .onConflictDoUpdate({
          target: schema.places.tourapiContentId,
          set: {
            lat: p.lat,
            lng: p.lng,
            regionCode: p.regionCode!,
            imageUrl: p.image,
          },
        })
```

(정확한 기존 `set` 필드는 파일을 읽어 유지하고 `imageUrl: p.image`만 더한다. EN/JA/ZH 경로는 place row를 만들지 않으므로 건드리지 않는다.)

- [ ] **Step 5: 빌드로 타입 검증**

Run: `pnpm build`
Expected: 타입 에러 없이 성공. (`p.image`, `imageUrl` 모두 타입 일치.)

- [ ] **Step 6: 커밋**

```bash
git add src/db/schema/places.ts src/db/migrations src/db/seeds/seed-places.ts
git commit -m "feat(places): add image_url column and seed from TourAPI firstimage"
```

---

## Task 2: getPlace 확장 (imageUrl·visitStatus·rating, OptionalJwt)

**Files:**
- Modify: `src/modules/places/places.repository.ts` (`hasVisit` 추가)
- Modify: `src/modules/places/places.service.ts` (`PlaceView`, `getPlace`)
- Modify: `src/modules/places/places.controller.ts` (`GET :id` 가드/파이프/userId)
- Test: `src/modules/places/places.service.spec.ts`

**Interfaces:**
- Consumes: `places.imageUrl`(Task 1), `Place.imageUrl`.
- Produces:
  - `PlacesRepository.hasVisit(userId: string, placeId: string): Promise<boolean>`
  - `PlaceView` = `{ id, regionCode, name, address, description, mission, tags, rarityWeight, imageUrl: string|null, rating: null, ratingCount: number, visitStatus: 'VISITED'|'NONE', lat, lng }`
  - `PlacesService.getPlace(id: string, locale: Locale, userId?: string | null): Promise<PlaceView>`

- [ ] **Step 1: getPlace 확장 실패 테스트 작성**

`src/modules/places/places.service.spec.ts`의 `beforeEach` repo 목에 `hasVisit: jest.fn()`을 추가한다:

```ts
    repo = {
      findById: jest.fn(),
      transFor: jest.fn(),
      transForMany: jest.fn(),
      listByProvince: jest.fn(),
      listAll: jest.fn(),
      create: jest.fn(),
      nearestRegionCode: jest.fn(),
      nearbyPlaces: jest.fn(),
      setStatus: jest.fn(),
      hasVisit: jest.fn(),
    };
```

기존 `describe('getPlace', ...)` 블록 안에 새 테스트를 추가한다(기존 `place` 목 상수를 재사용하되, 필요하면 imageUrl을 포함한 지역 상수를 쓴다):

```ts
    it('expands with imageUrl, rating placeholder, and VISITED when user visited', async () => {
      repo.findById.mockResolvedValue({
        id: 'p1', regionCode: '1_1', status: 'ACTIVE', tags: ['t'],
        rarityWeight: '1.50', imageUrl: 'http://tong/x.jpg', lat: 1, lng: 2,
      });
      repo.transFor.mockResolvedValue([{ locale: 'KO', name: '영금정', address: '속초', description: null, mission: null }]);
      repo.hasVisit.mockResolvedValue(true);

      const out = await service.getPlace('p1', 'KO', 'u1');

      expect(out.imageUrl).toBe('http://tong/x.jpg');
      expect(out.rating).toBeNull();
      expect(out.ratingCount).toBe(0);
      expect(out.visitStatus).toBe('VISITED');
      expect(repo.hasVisit).toHaveBeenCalledWith('u1', 'p1');
    });

    it('guest gets NONE and never queries visits; null imageUrl passes through', async () => {
      repo.findById.mockResolvedValue({
        id: 'p1', regionCode: '1_1', status: 'ACTIVE', tags: [],
        rarityWeight: '1.00', imageUrl: null, lat: null, lng: null,
      });
      repo.transFor.mockResolvedValue([{ locale: 'KO', name: '영금정', address: null, description: null, mission: null }]);

      const out = await service.getPlace('p1', 'KO', null);

      expect(out.imageUrl).toBeNull();
      expect(out.visitStatus).toBe('NONE');
      expect(repo.hasVisit).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- places.service.spec`
Expected: FAIL — `out.imageUrl` 등 undefined / `visitStatus` 없음 (getPlace가 아직 확장 안 됨).

- [ ] **Step 3: 리포지토리에 hasVisit 추가**

`src/modules/places/places.repository.ts` 상단 import에 `visits`를 추가한다:

```ts
import {
  places,
  placeTrans,
  visits,
  type Place,
  type PlaceTrans,
  type localeEnum,
  type placeStatusEnum,
} from '@db/schema';
```

클래스에 메서드를 추가한다(`findById` 아래):

```ts
  /** 해당 유저가 이 place를 방문(visit)했는지. */
  async hasVisit(userId: string, placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: visits.id })
      .from(visits)
      .where(and(eq(visits.userId, userId), eq(visits.placeId, placeId)))
      .limit(1);
    return !!row;
  }
```

(`and`, `eq`는 이미 import됨.)

- [ ] **Step 4: PlaceView 확장 + getPlace 구현**

`src/modules/places/places.service.ts`의 `PlaceView` 인터페이스를 교체한다:

```ts
export interface PlaceView {
  id: string;
  regionCode: string;
  name: string;
  address: string | null;
  description: string | null;
  mission: string | null;
  tags: string[];
  rarityWeight: number;
  imageUrl: string | null;
  rating: number | null;
  ratingCount: number;
  visitStatus: 'VISITED' | 'NONE';
  lat: number | null;
  lng: number | null;
}
```

`getPlace`를 교체한다:

```ts
  async getPlace(id: string, locale: Locale, userId?: string | null): Promise<PlaceView> {
    const place = await this.repo.findById(id);
    if (!place || place.status !== 'ACTIVE') {
      throw new NotFoundException('Place not found');
    }
    const trans = await this.repo.transFor(id, [locale, 'KO']);
    const t = this.pickTrans(trans, locale);
    const visited = userId ? await this.repo.hasVisit(userId, id) : false;
    return {
      id: place.id,
      regionCode: place.regionCode,
      name: t?.name ?? '',
      address: t?.address ?? null,
      description: t?.description ?? null,
      mission: t?.mission ?? null,
      tags: place.tags,
      rarityWeight: Number(place.rarityWeight),
      imageUrl: place.imageUrl ?? null,
      rating: null,
      ratingCount: 0,
      visitStatus: visited ? 'VISITED' : 'NONE',
      lat: place.lat,
      lng: place.lng,
    };
  }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm test -- places.service.spec`
Expected: PASS (신규 2개 + 기존 getPlace/createPlace 테스트 모두).

- [ ] **Step 6: 컨트롤러에 OptionalJwt + UUID + userId 배선**

`src/modules/places/places.controller.ts` import에 다음을 추가한다:

```ts
import { UseGuards } from '@nestjs/common'; // 기존 @nestjs/common import 목록에 UseGuards 추가
import { OptionalJwtAuthGuard } from '@modules/auth/guards/optional-jwt-auth.guard';
import { OptionalUser } from '@modules/auth/decorators/optional-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
```

(주의: `UseGuards`는 이미 있는 `import { Controller, Get, ... } from '@nestjs/common'` 블록에 이름만 추가한다 — 중복 import 문 만들지 말 것.)

`GET :id` 핸들러를 교체한다:

```ts
  /** 여행지 상세 (점수/가중치는 scoring 도메인에서 별도 조회). */
  @ApiOperation({ summary: '여행지 상세' })
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @OptionalUser() user: AuthUser | null,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.places.getPlace(id, ctx.locale, user?.userId ?? null);
  }
```

- [ ] **Step 7: 빌드 확인**

Run: `pnpm build`
Expected: 성공(타입 에러 없음).

- [ ] **Step 8: 커밋**

```bash
git add src/modules/places/places.repository.ts src/modules/places/places.service.ts src/modules/places/places.controller.ts src/modules/places/places.service.spec.ts
git commit -m "feat(places): expand place detail with imageUrl, visitStatus, rating placeholder"
```

---

## Task 3: regions·home imageUrl 실데이터 배선

**Files:**
- Modify: `src/modules/regions/regions.repository.ts`
- Modify: `src/modules/regions/regions.service.ts`
- Modify: `src/modules/home/home.repository.ts`
- Modify: `src/modules/home/home.service.ts`
- Test: `src/modules/regions/regions.service.spec.ts`, `src/modules/home/home.service.spec.ts`

**Interfaces:**
- Consumes: `places.imageUrl`(Task 1).
- Produces:
  - `RegionsRepository.listPlaces` 반환 항목에 `imageUrl: string | null` 추가.
  - `RegionsRepository.listRecommended` 반환 `{ id: string; imageUrl: string | null }[]`.
  - `HomeRepository.discoveryToday` 반환 `{ id: string; imageUrl: string | null }[]`.
  - `RegionPlaceItem.imageUrl` / `RecommendedItem.imageUrl` / `DiscoveryItem.imageUrl` 타입 `string | null`.

- [ ] **Step 1: 기존 spec 기대값을 실데이터로 바꾸는 실패 테스트 작성**

`src/modules/regions/regions.service.spec.ts`의 `listPlaces` 테스트에서 목 row에 imageUrl을 넣고 기대값을 바꾼다:

```ts
      repo.listPlaces.mockResolvedValue([
        { id: 'p1', createdAt: new Date('2026-07-07T00:00:00Z'), visited: true, imageUrl: 'http://tong/p1.jpg' },
      ]);
      // ...
      expect(out.items[0]).toEqual({
        placeId: 'p1', name: '영금정', address: '속초', imageUrl: 'http://tong/p1.jpg', visitStatus: 'VISITED',
      });
```

같은 파일 `listRecommended` 테스트:

```ts
    it('maps recommended items with imageUrl', async () => {
      repo.listRecommended.mockResolvedValue([{ id: 'p2', imageUrl: null }]);
      repo.placeTransForMany.mockResolvedValue([
        { placeId: 'p2', locale: 'KO', name: '설악산', address: '속초' },
      ]);
      const out = await service.listRecommended({ code: '32', userId: 'u1', locale: 'KO', limit: 1 });
      expect(out).toEqual([{ placeId: 'p2', name: '설악산', address: '속초', imageUrl: null }]);
    });
```

`src/modules/home/home.service.spec.ts`의 `discoveryToday` 테스트 2개를 갱신한다:

```ts
      repo.discoveryToday.mockResolvedValue([
        { id: 'p1', imageUrl: 'http://tong/p1.jpg' },
        { id: 'p2', imageUrl: null },
      ]);
      // ...
      expect(out).toEqual([
        { placeId: 'p1', name: '영금정', address: '속초 A', imageUrl: 'http://tong/p1.jpg' },
        { placeId: 'p2', name: '설악산', address: null, imageUrl: null },
      ]);
```

그리고 clamp 테스트의 목도:

```ts
      repo.discoveryToday.mockResolvedValue([{ id: 'p9', imageUrl: null }]);
      // ...
      expect(out).toEqual([{ placeId: 'p9', name: '', address: null, imageUrl: null }]);
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- regions.service.spec home.service.spec`
Expected: FAIL — imageUrl이 아직 `null` 하드코딩이라 기대값과 불일치.

- [ ] **Step 3: regions 리포지토리 select에 imageUrl 추가**

`src/modules/regions/regions.repository.ts`의 `listPlaces` 반환 타입과 두 select를 수정한다:

반환 타입:
```ts
  ): Promise<Array<{ id: string; createdAt: Date; visited: boolean; imageUrl: string | null }>> {
```

`p.userId` 분기 select:
```ts
      return this.db
        .select({ id: places.id, createdAt: places.createdAt, visited, imageUrl: places.imageUrl })
        .from(places)
        .leftJoin(visits, and(eq(visits.placeId, places.id), eq(visits.userId, p.userId)))
        .where(and(...conds))
        .orderBy(desc(places.createdAt), desc(places.id))
        .limit(p.limit + 1);
```

게스트 분기 select:
```ts
    return this.db
      .select({ id: places.id, createdAt: places.createdAt, visited, imageUrl: places.imageUrl })
      .from(places)
      .where(and(...conds))
      .orderBy(desc(places.createdAt), desc(places.id))
      .limit(p.limit + 1);
```

`listRecommended` 반환 타입과 select:
```ts
  ): Promise<{ id: string; imageUrl: string | null }[]> {
    // ... conds 동일 ...
    return this.db
      .select({ id: places.id, imageUrl: places.imageUrl })
      .from(places)
      .where(and(...conds))
      .orderBy(desc(places.basePoints), desc(places.id))
      .limit(p.limit);
```

- [ ] **Step 4: regions 서비스 타입·매핑 수정**

`src/modules/regions/regions.service.ts`에서 `imageUrl: null` 타입을 바꾼다:

```ts
export interface RegionPlaceItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: string | null;
  visitStatus: 'VISITED' | 'NONE';
}
```
```ts
export interface RecommendedItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: string | null;
}
```

`listPlaces`의 item 매핑에서 `imageUrl: null` → `imageUrl: r.imageUrl ?? null`:
```ts
      return {
        placeId: r.id,
        name: t?.name ?? '',
        address: t?.address ?? null,
        imageUrl: r.imageUrl ?? null,
        visitStatus: r.visited ? 'VISITED' : 'NONE',
      };
```

`listRecommended`의 반환 매핑:
```ts
      return { placeId: r.id, name: t?.name ?? '', address: t?.address ?? null, imageUrl: r.imageUrl ?? null };
```

- [ ] **Step 5: home 리포지토리 select에 imageUrl 추가**

`src/modules/home/home.repository.ts`의 `discoveryToday` 반환 타입과 select를 수정한다:

```ts
  async discoveryToday(userId: string, limit: number): Promise<{ id: string; imageUrl: string | null }[]> {
    return this.db
      .select({ id: places.id, imageUrl: places.imageUrl })
      .from(places)
      .where(
        and(
          eq(places.status, 'ACTIVE'),
          sql`NOT EXISTS (SELECT 1 FROM ${visits} v WHERE v.place_id = ${places.id} AND v.user_id = ${userId})`,
        ),
      )
      .orderBy(sql`md5(${places.id}::text || current_date::text)`)
      .limit(limit);
  }
```

- [ ] **Step 6: home 서비스 타입·매핑 수정**

`src/modules/home/home.service.ts`에서:

```ts
export interface DiscoveryItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: string | null;
}
```

`discoveryToday`의 반환 매핑(line 70):
```ts
    return rows.map((r) => {
      const t = this.pickTrans(trans.filter((x) => x.placeId === r.id), locale);
      return { placeId: r.id, name: t?.name ?? '', address: t?.address ?? null, imageUrl: r.imageUrl ?? null };
    });
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test -- regions.service.spec home.service.spec`
Expected: PASS (갱신한 imageUrl 기대값 통과).

- [ ] **Step 8: 빌드 확인**

Run: `pnpm build`
Expected: 성공.

- [ ] **Step 9: 커밋**

```bash
git add src/modules/regions/regions.repository.ts src/modules/regions/regions.service.ts src/modules/regions/regions.service.spec.ts src/modules/home/home.repository.ts src/modules/home/home.service.ts src/modules/home/home.service.spec.ts
git commit -m "feat(places): serve real place imageUrl in region list/recommended and home discovery"
```

---

## Task 4: 인증사진 공개 피드 (GET /places/:id/certifications)

**Files:**
- Modify: `src/modules/certifications/certifications.repository.ts` (`publicFeedForPlace`)
- Modify: `src/modules/certifications/certifications.service.ts` (`publicFeedForPlace`)
- Modify: `src/modules/places/dto/place.dto.ts` (`PlaceCertFeedQueryDto`)
- Modify: `src/modules/places/places.controller.ts` (피드 라우트)
- Modify: `src/modules/places/places.module.ts` (`CertificationsModule` import)
- Test: `src/modules/certifications/certifications.service.spec.ts`

**Interfaces:**
- Consumes: `certifications`(status/visibility/imageKey/createdAt), `users.handle`, `buildCursorPage`/`decodeCursor`.
- Produces:
  - `CertificationsRepository.publicFeedForPlace(placeId: string, cursor: string | undefined, limit: number): Promise<Array<{ id: string; createdAt: Date; imageKey: string; handle: string }>>` (limit+1 fetch, createdAt DESC·id DESC).
  - `CertificationsService.publicFeedForPlace(placeId: string, cursor: string | undefined, limit: number): Promise<{ items: { imageUrl: string; userHandle: string; createdAt: Date }[]; nextCursor: string | null }>`.

- [ ] **Step 1: 서비스 피드 실패 테스트 작성**

`src/modules/certifications/certifications.service.spec.ts`의 `beforeEach` repo 목에 `publicFeedForPlace: jest.fn()`을 추가한다:

```ts
    repo = {
      placeCoords: jest.fn(),
      findByUserImageKey: jest.fn(),
      createPending: jest.fn(),
      createRejected: jest.fn(),
      getResult: jest.fn(),
      publicFeedForPlace: jest.fn(),
    };
```

새 describe 블록을 추가한다:

```ts
  describe('publicFeedForPlace', () => {
    it('maps rows to imageUrl + handle and builds nextCursor', async () => {
      const rows = [
        { id: 'c2', createdAt: new Date('2026-07-07T00:00:00Z'), imageKey: 'certifications/b.jpg', handle: '@b' },
        { id: 'c1', createdAt: new Date('2026-07-06T00:00:00Z'), imageKey: 'certifications/a.jpg', handle: '@a' },
      ];
      repo.publicFeedForPlace.mockResolvedValue(rows);
      const out = await service.publicFeedForPlace('p1', undefined, 1);
      expect(repo.publicFeedForPlace).toHaveBeenCalledWith('p1', undefined, 1);
      expect(out.items).toEqual([
        { imageUrl: '/api/certifications/photos/certifications/b.jpg', userHandle: '@b', createdAt: rows[0].createdAt },
      ]);
      expect(out.nextCursor).not.toBeNull();
    });

    it('returns empty page with null cursor when no certs', async () => {
      repo.publicFeedForPlace.mockResolvedValue([]);
      const out = await service.publicFeedForPlace('p1', undefined, 8);
      expect(out).toEqual({ items: [], nextCursor: null });
    });
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test -- certifications.service.spec`
Expected: FAIL — `service.publicFeedForPlace`가 함수 아님.

- [ ] **Step 3: 리포지토리 쿼리 추가**

`src/modules/certifications/certifications.repository.ts` 상단 import를 보강한다(현재 `and, eq`만 있음):

```ts
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { decodeCursor } from '@platform/pagination/cursor';
import { certifications, scoreEvents, visits, places, users, type Certification } from '@db/schema';
```

클래스에 메서드를 추가한다:

```ts
  /** place 공개 인증사진 피드 — PUBLIC + ACCEPTED, 최신순(createdAt DESC, id DESC), users.handle 조인. */
  async publicFeedForPlace(
    placeId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<Array<{ id: string; createdAt: Date; imageKey: string; handle: string }>> {
    const c = decodeCursor(cursor);
    const conds = [
      eq(certifications.placeId, placeId),
      eq(certifications.status, 'ACCEPTED'),
      eq(certifications.visibility, 'PUBLIC'),
    ];
    if (c) {
      conds.push(
        or(
          lt(certifications.createdAt, c.createdAt),
          and(eq(certifications.createdAt, c.createdAt), lt(certifications.id, c.id)),
        )!,
      );
    }
    return this.db
      .select({
        id: certifications.id,
        createdAt: certifications.createdAt,
        imageKey: certifications.imageKey,
        handle: users.handle,
      })
      .from(certifications)
      .innerJoin(users, eq(users.id, certifications.userId))
      .where(and(...conds))
      .orderBy(desc(certifications.createdAt), desc(certifications.id))
      .limit(limit + 1);
  }
```

- [ ] **Step 4: 서비스 메서드 추가**

`src/modules/certifications/certifications.service.ts` 상단에 import를 추가한다:

```ts
import { buildCursorPage } from '@platform/pagination/cursor';
```

클래스에 메서드를 추가한다:

```ts
  /** place 공개 인증사진 피드 — 다른 여행자들의 PUBLIC·ACCEPTED 사진, 커서 페이지. */
  async publicFeedForPlace(
    placeId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: { imageUrl: string; userHandle: string; createdAt: Date }[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const rows = await this.repo.publicFeedForPlace(placeId, cursor, lim);
    const page = buildCursorPage(rows, lim);
    return {
      items: page.items.map((r) => ({
        imageUrl: `/api/certifications/photos/${r.imageKey}`,
        userHandle: r.handle,
        createdAt: r.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }
```

- [ ] **Step 5: 서비스 테스트 통과 확인**

Run: `pnpm test -- certifications.service.spec`
Expected: PASS. (limit=1이라 목 2행 중 1행만 items, nextCursor 존재.)

- [ ] **Step 6: 피드 쿼리 DTO 추가**

`src/modules/places/dto/place.dto.ts` 끝에 추가한다:

```ts
export class PlaceCertFeedQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().describe('최대 개수(기본 8)'),
  }),
) {}
```

- [ ] **Step 7: PlacesModule에 CertificationsModule import**

`src/modules/places/places.module.ts`를 수정한다:

```ts
import { CertificationsModule } from '@modules/certifications/certifications.module';
// ...
@Module({
  imports: [AdminModule, AuthModule, CertificationsModule],
  controllers: [PlacesController, AdminPlacesController, MePlacesController],
  providers: [PlacesRepository, PlacesService, CompositionsRepository, CompositionsService],
  exports: [PlacesService, CompositionsService],
})
export class PlacesModule {}
```

- [ ] **Step 8: 컨트롤러에 피드 라우트 추가**

`src/modules/places/places.controller.ts`에서 `CertificationsService`와 DTO를 import한다:

```ts
import { CertificationsService } from '@modules/certifications/certifications.service';
import { PlaceListQueryDto, NearbyQueryDto, PlaceCertFeedQueryDto } from './dto/place.dto';
```

생성자에 주입한다:

```ts
  constructor(
    private readonly places: PlacesService,
    private readonly compositionsService: CompositionsService,
    private readonly certs: CertificationsService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}
```

`GET :id/compositions` 라우트 아래, `GET :id` 위에 피드 라우트를 추가한다(정적/2세그먼트 라우트를 `:id`보다 앞에 둔다):

```ts
  /** 다른 여행자들의 공개 인증사진 피드 (PUBLIC·ACCEPTED, 최신순). */
  @ApiOperation({ summary: '여행지 인증사진 피드' })
  @Get(':id/certifications')
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 8 })
  certFeed(@Param('id', ParseUUIDPipe) id: string, @Query() q: PlaceCertFeedQueryDto) {
    return this.certs.publicFeedForPlace(id, q.cursor, q.limit ?? 8);
  }
```

- [ ] **Step 9: 빌드 확인**

Run: `pnpm build`
Expected: 성공. (순환 의존 없음 — CertificationsModule은 PlacesModule을 import하지 않음.)

- [ ] **Step 10: 전체 테스트 확인**

Run: `pnpm test`
Expected: 전 스위트 PASS.

- [ ] **Step 11: 커밋**

```bash
git add src/modules/certifications/certifications.repository.ts src/modules/certifications/certifications.service.ts src/modules/certifications/certifications.service.spec.ts src/modules/places/dto/place.dto.ts src/modules/places/places.module.ts src/modules/places/places.controller.ts
git commit -m "feat(places): add public certification feed endpoint for place detail"
```

---

## 최종 검증 (E2E, 수동)

브랜치 리뷰 후 실앱 구동으로 확인(기존 관례):

1. `pnpm db:migrate` — image_url 컬럼 반영.
2. (서버) `TOURAPI_KEY=... pnpm seed:places` 재실행 — 기존 place image_url 백필.
3. `GET /api/places/:id` (게스트) → `imageUrl`(값 또는 null), `visitStatus:"NONE"`, `rating:null`, `ratingCount:0`.
4. `GET /api/places/:id` (로그인, 방문한 place) → `visitStatus:"VISITED"`.
5. `GET /api/regions/:code/places` → items[].imageUrl 실데이터. `GET /api/discovery/today` → imageUrl 실데이터.
6. `GET /api/places/:id/certifications` (게스트) → PUBLIC·ACCEPTED items(imageUrl `/api/certifications/photos/...`, userHandle), 게스트로 그 imageUrl 접근 시 사진 서빙됨. cursor로 다음 페이지.

---

## Notes / 스코프 이탈

- **createPlace imageUrl 미배선(의도적 YAGNI):** 스펙은 어드민 createPlace에 imageUrl 옵션을 언급했으나, 어드민 DTO/시드가 이를 설정하지 않아 항상 null이 된다. 시드는 자체 raw insert로 image_url을 채우므로 repo.create 경로는 불필요. 어드민이 직접 이미지를 지정하는 기능은 후속(필요 시 CreatePlaceDto·CreatePlaceCmd·repo.create에 imageUrl 추가). place는 DB 기본값 null로 안전.
- **nearby thumbnailUrl 미변경:** `NearbyItem.thumbnailUrl`은 스펙 범위 밖이라 null 유지.
- **후속:** 이미지 재호스팅(핫링크→스토리지), 상세 갤러리(detailImage2 다중), place_rating, PLANNED(찜), 인증 피드 인기순.
