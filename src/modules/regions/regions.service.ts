import { Injectable, NotFoundException } from '@nestjs/common';
import { buildCursorPage } from '@platform/pagination/cursor';
import type { localeEnum } from '@db/schema';
import { RegionsRepository } from './regions.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface RegionDetail {
  code: string;
  name: string;
  description: null;
  progress: { percent: number; collected: number; total: number; remaining: number };
}
export interface RegionPlaceItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: null;
  visitStatus: 'VISITED' | 'NONE';
}
export interface RegionPlacesPage {
  items: RegionPlaceItem[];
  counts: { all: number; visited: number; planned: number };
  nextCursor: string | null;
}
export interface RecommendedItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: null;
}

@Injectable()
export class RegionsService {
  constructor(private readonly repo: RegionsRepository) {}

  async getRegion(code: string, userId: string | null, locale: Locale): Promise<RegionDetail> {
    const region = await this.repo.findProvince(code);
    if (!region) throw new NotFoundException('Region not found');
    const names = await this.repo.regionNames(code, [locale, 'KO']);
    const name = this.pickName(names, locale);
    const total = await this.repo.countPlaces(code);
    const collected = userId ? await this.repo.countVisited(userId, code) : 0;
    const percent = total > 0 ? Math.round((collected / total) * 100) : 0;
    return {
      code,
      name,
      description: null,
      progress: { percent, collected, total, remaining: total - collected },
    };
  }

  async listPlaces(params: {
    code: string;
    userId: string | null;
    onlyVisited: boolean;
    locale: Locale;
    cursor?: string;
    limit: number;
  }): Promise<RegionPlacesPage> {
    const limit = Math.min(Math.max(params.limit, 1), 100);
    if (params.onlyVisited && !params.userId) {
      // Guests have zero visits by definition, so the "visited only" filter
      // must yield an empty page rather than falling back to all places.
      const all = await this.repo.countPlaces(params.code);
      return { items: [], counts: { all, visited: 0, planned: 0 }, nextCursor: null };
    }
    const rows = await this.repo.listPlaces({
      code: params.code,
      userId: params.userId,
      onlyVisited: params.onlyVisited,
      limit,
      cursor: params.cursor,
    });
    const page = buildCursorPage(rows, limit);
    const trans = await this.repo.placeTransForMany(
      page.items.map((r) => r.id),
      [params.locale, 'KO'],
    );
    const items: RegionPlaceItem[] = page.items.map((r) => {
      const t = this.pickTrans(trans, r.id, params.locale);
      return {
        placeId: r.id,
        name: t?.name ?? '',
        address: t?.address ?? null,
        imageUrl: null,
        visitStatus: r.visited ? 'VISITED' : 'NONE',
      };
    });
    const all = await this.repo.countPlaces(params.code);
    const visited = params.userId ? await this.repo.countVisited(params.userId, params.code) : 0;
    return { items, counts: { all, visited, planned: 0 }, nextCursor: page.nextCursor };
  }

  async listRecommended(params: {
    code: string;
    userId: string | null;
    locale: Locale;
    limit: number;
  }): Promise<RecommendedItem[]> {
    const limit = Math.min(Math.max(params.limit, 1), 10);
    const rows = await this.repo.listRecommended({
      code: params.code,
      userId: params.userId,
      limit,
    });
    const trans = await this.repo.placeTransForMany(
      rows.map((r) => r.id),
      [params.locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(trans, r.id, params.locale);
      return { placeId: r.id, name: t?.name ?? '', address: t?.address ?? null, imageUrl: null };
    });
  }

  private pickName(names: { locale: string; name: string }[], locale: Locale): string {
    return (
      names.find((n) => n.locale === locale)?.name ??
      names.find((n) => n.locale === 'KO')?.name ??
      ''
    );
  }

  private pickTrans(
    trans: { placeId: string; locale: string; name: string; address: string | null }[],
    placeId: string,
    locale: Locale,
  ) {
    const rows = trans.filter((t) => t.placeId === placeId);
    return rows.find((t) => t.locale === locale) ?? rows.find((t) => t.locale === 'KO');
  }
}
