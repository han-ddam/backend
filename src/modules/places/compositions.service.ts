import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { localeEnum } from '@db/schema';
import { IdService } from '@platform/id/id.service';
import { STORAGE, type StoragePort } from '@platform/storage/storage.port';
import { CompositionsRepository } from './compositions.repository';

type Locale = (typeof localeEnum.enumValues)[number];

export interface CompositionItem {
  seq: number;
  title: string;
  description: string | null;
  exampleImageUrl: string | null;
  source: string;
}

@Injectable()
export class CompositionsService {
  constructor(
    private readonly repo: CompositionsRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly id: IdService,
  ) {}

  /** 공개 조회 — seq순, locale/KO 폴백, imageUrl 조립. */
  async forPlace(placeId: string, locale: Locale): Promise<CompositionItem[]> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    const rows = await this.repo.listForPlace(placeId);
    const trans = await this.repo.transForCompositions(
      rows.map((r) => r.id),
      [locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(trans.filter((x) => x.compositionId === r.id), locale);
      return {
        seq: r.seq,
        title: t?.title ?? '',
        description: t?.description ?? null,
        exampleImageUrl: r.exampleImageKey
          ? `/api/places/compositions/photos/${r.exampleImageKey}`
          : null,
        source: r.source,
      };
    });
  }

  private pickTrans(
    trans: { locale: string; title: string; description: string | null }[],
    locale: Locale,
  ) {
    return trans.find((t) => t.locale === locale) ?? trans.find((t) => t.locale === 'KO');
  }
}
