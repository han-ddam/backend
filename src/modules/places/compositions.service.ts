import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { localeEnum } from '@db/schema'; // 값으로도 사용 (enumValues)
import { IdService } from '@platform/id/id.service';
import { STORAGE, type StoragePort } from '@platform/storage/storage.port';
import { CompositionsRepository } from './compositions.repository';
import { GENERATOR, type CompositionGeneratorPort } from './compositions/generator/generator.port';
import { parseCsv } from './compositions.csv';

type Locale = (typeof localeEnum.enumValues)[number];

export interface CompositionItem {
  seq: number;
  title: string;
  description: string | null;
  exampleImageUrl: string | null;
  source: string;
}

export interface AdminCompositionItem {
  id: string;
  seq: number;
  source: string;
  exampleImageUrl: string | null;
  translations: { locale: string; title: string; description: string | null }[];
}

@Injectable()
export class CompositionsService {
  private readonly logger = new Logger(CompositionsService.name);

  constructor(
    private readonly repo: CompositionsRepository,
    @Inject(STORAGE) private readonly storage: StoragePort,
    private readonly id: IdService,
    @InjectQueue('composition') private readonly queue: Queue,
    @Inject(GENERATOR) private readonly generator: CompositionGeneratorPort,
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
    if (rows.length === 0 && this.generator.enabled) {
      const gen = await this.repo.generatedAt(placeId);
      if (gen === null) {
        try {
          await this.queue.add(
            'gen',
            { placeId },
            {
              jobId: placeId,
              removeOnComplete: true,
              removeOnFail: true,
              attempts: 2,
              backoff: { type: 'exponential', delay: 3000 },
            },
          );
        } catch (e) {
          this.logger.warn(`composition enqueue failed for ${placeId}: ${e}`);
        }
      }
    }
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

  async uploadPhoto(buffer: Buffer, mime: string): Promise<{ imageKey: string }> {
    const { key } = await this.storage.save(buffer, mime, 'compositions');
    return { imageKey: key };
  }

  async adminCreate(
    placeId: string,
    cmd: {
      seq: number;
      source?: 'CURATED' | 'AI';
      imageKey?: string;
      translations: { locale: string; title: string; description?: string }[];
    },
  ): Promise<{ compositionId: string }> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    if (!cmd.translations.some((t) => t.locale === 'KO')) {
      throw new BadRequestException('KO translation is required');
    }
    const compositionId = this.id.generate();
    await this.repo.create(
      {
        id: compositionId,
        placeId,
        seq: cmd.seq,
        source: cmd.source ?? 'CURATED',
        exampleImageKey: cmd.imageKey ?? null,
      },
      cmd.translations.map((t) => ({
        locale: t.locale,
        title: t.title,
        description: t.description ?? null,
      })),
    );
    return { compositionId };
  }

  async adminList(placeId: string): Promise<AdminCompositionItem[]> {
    const rows = await this.repo.listForPlace(placeId);
    const trans = await this.repo.transForCompositions(
      rows.map((r) => r.id),
      [...localeEnum.enumValues], // 전 locale
    );
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      source: r.source,
      exampleImageUrl: r.exampleImageKey
        ? `/api/places/compositions/photos/${r.exampleImageKey}`
        : null,
      translations: trans
        .filter((t) => t.compositionId === r.id)
        .map((t) => ({ locale: t.locale, title: t.title, description: t.description })),
    }));
  }

  async adminDelete(compositionId: string): Promise<void> {
    const ok = await this.repo.deleteById(compositionId);
    if (!ok) throw new NotFoundException('Composition not found');
  }

  async importCsv(
    buffer: Buffer,
  ): Promise<{ placesUpdated: number; imported: number; skipped: { line: number; reason: string }[] }> {
    const rows = parseCsv(buffer.toString('utf-8'));
    const skipped: { line: number; reason: string }[] = [];
    if (rows.length < 2) return { placesUpdated: 0, imported: 0, skipped };
    const h = rows[0].map((x) => x.toLowerCase());
    const col = { region: h.indexOf('region_code'), name: h.indexOf('place_name'), seq: h.indexOf('seq'), title: h.indexOf('title'), desc: h.indexOf('description') };
    if (col.region < 0 || col.name < 0 || col.title < 0) {
      throw new BadRequestException('CSV header requires region_code, place_name, title');
    }
    // (region|name) 그룹핑
    const groups = new Map<string, { regionCode: string; name: string; firstLine: number; items: { seq: number; title: string; description: string | null }[] }>();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const regionCode = r[col.region] ?? '', name = r[col.name] ?? '', title = r[col.title] ?? '';
      if (!regionCode || !name || !title) { skipped.push({ line: i + 1, reason: 'missing region_code/place_name/title' }); continue; }
      const key = `${regionCode}|${name}`;
      const g = groups.get(key) ?? { regionCode, name, firstLine: i + 1, items: [] };
      const seq = col.seq >= 0 && r[col.seq] ? Number(r[col.seq]) : g.items.length;
      g.items.push({ seq: Number.isFinite(seq) ? seq : g.items.length, title, description: col.desc >= 0 ? (r[col.desc] || null) : null });
      groups.set(key, g);
    }
    let placesUpdated = 0, imported = 0;
    for (const g of groups.values()) {
      const placeId = await this.repo.resolvePlaceByRegionName(g.regionCode, g.name);
      if (!placeId) { skipped.push({ line: g.firstLine, reason: `place not found: ${g.regionCode}/${g.name}` }); continue; }
      await this.repo.replaceForPlace(placeId, g.items, 'CURATED');
      placesUpdated++; imported += g.items.length;
    }
    return { placesUpdated, imported, skipped };
  }
}
