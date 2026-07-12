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

export interface ThemeCard {
  collectionId: string;
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
