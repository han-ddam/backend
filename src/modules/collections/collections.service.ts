import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { IdService } from '@platform/id/id.service';
import { DogamService } from '@modules/dogam/dogam.service';
import { CollectionsRepository } from './collections.repository';
import {
  decodeSeqCursor,
  buildSeqPage,
  decodeMergedCursor,
  encodeMergedRegion,
  encodeMergedTheme,
} from './collections.cursor';

type Locale = (typeof localeEnum.enumValues)[number];

export interface CollectionDetailItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: string | null;
  visitStatus: 'VISITED' | 'NONE';
}

export interface ThemeCard {
  collectionId: string;
  title: string;
  filled: number;
  total: number;
  thumbnails: string[];
}

export interface MyCollectionItem {
  kind: 'REGION' | 'THEME';
  id: string;
  title: string;
  filled: number;
  total: number;
  thumbnails: string[];
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
