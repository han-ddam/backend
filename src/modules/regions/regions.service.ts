import { Injectable, NotFoundException } from '@nestjs/common';
import { buildCursorPage } from '@platform/pagination/cursor';
import type { localeEnum } from '@db/schema';
import { RegionsRepository } from './regions.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface RegionListItem {
  code: string;
  name: string;
}

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
  imageUrl: string | null;
  visitStatus: 'VISITED' | 'PLANNED' | 'NONE';
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
  imageUrl: string | null;
}

@Injectable()
export class RegionsService {
  constructor(private readonly repo: RegionsRepository) {}

  /** 시·도 목록 — 코드·이름 (locale 우선, KO 폴백), 코드 정수 오름차순. */
  async listRegions(locale: Locale): Promise<RegionListItem[]> {
    const rows = await this.repo.listProvinces([locale, 'KO']);
    const codes = [...new Set(rows.map((r) => r.code))];
    return codes
      .map((code) => ({
        code,
        name: this.pickName(rows.filter((r) => r.code === code), locale),
      }))
      .sort((a, b) => Number(a.code) - Number(b.code));
  }

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
    status: 'ALL' | 'VISITED' | 'PLANNED';
    locale: Locale;
    cursor?: string;
    limit: number;
  }): Promise<RegionPlacesPage> {
    const limit = Math.min(Math.max(params.limit, 1), 100);
    if (params.status !== 'ALL' && !params.userId) {
      // 게스트는 방문·찜이 없으므로 VISITED/PLANNED 필터는 빈 페이지.
      const all = await this.repo.countPlaces(params.code);
      return { items: [], counts: { all, visited: 0, planned: 0 }, nextCursor: null };
    }
    const rows = await this.repo.listPlaces({
      code: params.code,
      userId: params.userId,
      status: params.status,
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
        imageUrl: r.imageUrl ?? null,
        visitStatus: r.visited ? 'VISITED' : r.bookmarked ? 'PLANNED' : 'NONE',
      };
    });
    const all = await this.repo.countPlaces(params.code);
    const visited = params.userId ? await this.repo.countVisited(params.userId, params.code) : 0;
    const planned = params.userId ? await this.repo.countPlanned(params.userId, params.code) : 0;
    return { items, counts: { all, visited, planned }, nextCursor: page.nextCursor };
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
      return { placeId: r.id, name: t?.name ?? '', address: t?.address ?? null, imageUrl: r.imageUrl ?? null };
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
