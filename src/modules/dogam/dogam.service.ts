import { Injectable } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { RegionsService } from '@modules/regions/regions.service';
import { buildCursorPage, type CursorPage } from '@platform/pagination/cursor';
import { DogamRepository } from './dogam.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface RegionCard {
  sidoCode: string;
  name: string;
  percent: number;
  collected: number;
  total: number;
  locked: boolean;
}

export interface RecentItem {
  placeId: string;
  name: string;
  imageUrl: string | null;
  collectedAt: string;
}

@Injectable()
export class DogamService {
  constructor(
    private readonly repo: DogamRepository,
    private readonly regionsService: RegionsService,
  ) {}

  async overview(userId: string): Promise<{ percent: number; collected: number; total: number }> {
    const { collected, total } = await this.repo.overview(userId);
    return { percent: total > 0 ? Math.round((collected / total) * 100) : 0, collected, total };
  }

  async regions(userId: string, locale: Locale): Promise<RegionCard[]> {
    const [names, totals, visited] = await Promise.all([
      this.regionsService.listRegions(locale), // 정렬된 [{code,name}]
      this.repo.regionTotals(),
      this.repo.regionVisited(userId),
    ]);
    return names.map(({ code, name }) => {
      const total = totals.get(code) ?? 0;
      const collected = visited.get(code) ?? 0;
      return {
        sidoCode: code,
        name,
        collected,
        total,
        percent: total > 0 ? Math.round((collected / total) * 100) : 0,
        locked: false,
      };
    });
  }

  async recent(
    userId: string,
    locale: Locale,
    cursor?: string,
    limit?: number,
  ): Promise<CursorPage<RecentItem>> {
    const lim = Math.min(Math.max(limit ?? 20, 1), 100);
    const rows = await this.repo.recentVisitsPage(userId, lim, cursor);
    const page = buildCursorPage(rows, lim);
    const ids = page.items.map((r) => r.placeId);
    const names = await this.repo.placeNames(ids, [locale, 'KO']);
    const images = await this.repo.certImagesFor(userId, ids);
    const imgMap = new Map(images.map((i) => [i.placeId, i.imageKey]));
    const nameMap = new Map<string, { locale: string; name: string }[]>();
    for (const n of names) {
      const list = nameMap.get(n.placeId);
      if (list) list.push(n);
      else nameMap.set(n.placeId, [n]);
    }
    const items: RecentItem[] = page.items.map((r) => {
      const key = imgMap.get(r.placeId);
      return {
        placeId: r.placeId,
        name: this.pickName(nameMap.get(r.placeId) ?? [], locale),
        imageUrl: key ? `/api/certifications/photos/${key}` : null,
        collectedAt: r.createdAt.toISOString(),
      };
    });
    return { items, nextCursor: page.nextCursor };
  }

  private pickName(
    names: { locale: string; name: string }[],
    locale: Locale,
  ): string {
    return (
      names.find((n) => n.locale === locale)?.name ??
      names.find((n) => n.locale === 'KO')?.name ??
      ''
    );
  }
}
