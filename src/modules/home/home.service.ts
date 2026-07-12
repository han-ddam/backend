import { Injectable } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { StatsService } from '@modules/stats/stats.service';
import { DogamService } from '@modules/dogam/dogam.service';
import { HomeRepository } from './home.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface SummaryResult {
  score: number;
  nationalRank: number | null;
  totalUsers: number;
  progress: { percent: number; collected: number; total: number };
}
export interface SidoProgress {
  sidoCode: string;
  name: string;
  percent: number;
  collected: number;
  total: number;
}
export interface DiscoveryItem {
  placeId: string;
  name: string;
  address: string | null;
  imageUrl: null;
}

@Injectable()
export class HomeService {
  constructor(
    private readonly repo: HomeRepository,
    private readonly stats: StatsService,
    private readonly dogam: DogamService,
  ) {}

  async summary(userId: string): Promise<SummaryResult> {
    const [s, dg] = await Promise.all([
      this.stats.summaryStats(userId),
      this.dogam.overview(userId),
    ]);
    return {
      score: s.score,
      nationalRank: s.nationalRank,
      totalUsers: s.totalUsers,
      progress: { percent: dg.percent, collected: dg.collected, total: dg.total },
    };
  }

  async progressSido(userId: string, locale: Locale): Promise<SidoProgress[]> {
    const cards = await this.dogam.regions(userId, locale);
    return cards.map(({ sidoCode, name, percent, collected, total }) => ({
      sidoCode,
      name,
      percent,
      collected,
      total,
    }));
  }

  async discoveryToday(userId: string, locale: Locale, limit?: number): Promise<DiscoveryItem[]> {
    const lim = Math.min(Math.max(limit ?? 3, 1), 20);
    const rows = await this.repo.discoveryToday(userId, lim);
    const trans = await this.repo.placeNames(
      rows.map((r) => r.id),
      [locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(trans.filter((x) => x.placeId === r.id), locale);
      return { placeId: r.id, name: t?.name ?? '', address: t?.address ?? null, imageUrl: null };
    });
  }

  private pickTrans(
    trans: { locale: string; name: string; address: string | null }[],
    locale: Locale,
  ) {
    return trans.find((t) => t.locale === locale) ?? trans.find((t) => t.locale === 'KO');
  }
}
