import { Injectable } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { RegionsService } from '@modules/regions/regions.service';
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
    const names = await this.regionsService.listRegions(locale); // 정렬된 [{code,name}]
    const totals = await this.repo.regionTotals();
    const visited = await this.repo.regionVisited(userId);
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
}
