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
