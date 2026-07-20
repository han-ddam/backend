import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdService } from '@platform/id/id.service';
import { buildCursorPage, type CursorPage } from '@platform/pagination/cursor';
import { STORAGE, type StoragePort } from '@platform/storage/storage.port';
import type { Place, PlaceTrans, localeEnum, placeStatusEnum } from '@db/schema';
import { RatingsService } from '@modules/ratings/ratings.service';
import { WeightConfigsService } from '@modules/scoring/weight-configs.service';
import {
  PlacesRepository,
  type PlaceTransInput,
} from './places.repository';

type Locale = (typeof localeEnum.enumValues)[number];
type PlaceStatus = (typeof placeStatusEnum.enumValues)[number];

export interface PlaceView {
  id: string;
  regionCode: string;
  name: string;
  address: string | null;
  description: string | null;
  mission: string | null;
  tags: string[];
  rarityWeight: number;
  imageUrl: string | null;
  rating: number | null;
  ratingCount: number;
  myRating: number | null;
  reviewCount: number;
  visitStatus: 'VISITED' | 'PLANNED' | 'NONE';
  lat: number | null;
  lng: number | null;
}

export interface PlaceListItem {
  id: string;
  name: string;
  address: string | null;
  tags: string[];
}

export interface CreatePlaceCmd {
  regionCode: string;
  tourapiContentId?: string | null;
  lat?: number | null;
  lng?: number | null;
  basePoints: number;
  rarityWeight: number;
  tags?: string[];
  translations: PlaceTransInput[]; // KO 필수
}

export interface SubmitUserPlaceCmd {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  description?: string;
}

export interface NearbyItem {
  placeId: string;
  name: string;
  address: string | null;
  distanceM: number;
  regionCode: string;
  thumbnailUrl: string | null;
}

@Injectable()
export class PlacesService {
  constructor(
    private readonly repo: PlacesRepository,
    private readonly id: IdService,
    private readonly ratings: RatingsService,
    private readonly weightConfigs: WeightConfigsService,
    @Inject(STORAGE) private readonly storage: StoragePort,
  ) {}

  async getPlace(id: string, locale: Locale, userId?: string | null): Promise<PlaceView> {
    const place = await this.repo.findById(id);
    if (!place || place.status !== 'ACTIVE') {
      throw new NotFoundException('Place not found');
    }
    const trans = await this.repo.transFor(id, [locale, 'KO']);
    const t = this.pickTrans(trans, locale);
    const [flags, agg] = await Promise.all([
      userId
        ? this.repo.userPlaceFlags(userId, id)
        : Promise.resolve({ visited: false, bookmarked: false }),
      this.ratings.aggregateFor(id, userId),
    ]);
    const visitStatus = flags.visited ? 'VISITED' : flags.bookmarked ? 'PLANNED' : 'NONE';
    return {
      id: place.id,
      regionCode: place.regionCode,
      name: t?.name ?? '',
      address: t?.address ?? null,
      description: t?.description ?? null,
      mission: t?.mission ?? null,
      tags: place.tags,
      rarityWeight: Number(place.rarityWeight),
      imageUrl: place.imageUrl ?? null,
      rating: agg.average,
      ratingCount: agg.count,
      myRating: agg.myScore,
      reviewCount: agg.reviewCount,
      visitStatus,
      lat: place.lat,
      lng: place.lng,
    };
  }

  async listByProvince(params: {
    province: string;
    locale: Locale;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<PlaceListItem>> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const rows = await this.repo.listByProvince({
      province: params.province,
      status: 'ACTIVE',
      limit,
      cursor: params.cursor,
    });
    const page = buildCursorPage(rows, limit);
    const transRows = await this.repo.transForMany(
      page.items.map((p) => p.id),
      [params.locale, 'KO'],
    );
    return {
      items: page.items.map((p) => {
        const t = this.pickTrans(
          transRows.filter((x) => x.placeId === p.id),
          params.locale,
        );
        return {
          id: p.id,
          name: t?.name ?? '',
          address: t?.address ?? null,
          tags: p.tags,
        };
      }),
      nextCursor: page.nextCursor,
    };
  }

  async createPlace(cmd: CreatePlaceCmd): Promise<Place> {
    if (!cmd.translations.some((t) => t.locale === 'KO')) {
      throw new BadRequestException('KO translation is required');
    }
    return this.repo.create(
      {
        id: this.id.generate(),
        regionCode: cmd.regionCode,
        tourapiContentId: cmd.tourapiContentId ?? null,
        lat: cmd.lat ?? null,
        lng: cmd.lng ?? null,
        basePoints: cmd.basePoints,
        rarityWeight: cmd.rarityWeight.toFixed(2),
        tags: cmd.tags ?? [],
      },
      cmd.translations,
    );
  }

  /** 사용자 장소 제출 — 검수 대기(PENDING_REVIEW), 지역은 최근접 장소 상속. */
  async submitUserPlace(
    userId: string,
    cmd: SubmitUserPlaceCmd,
  ): Promise<{ placeId: string; status: 'PENDING_REVIEW'; regionCode: string }> {
    const regionCode = await this.repo.nearestRegionCode(cmd.lat, cmd.lng, 10000);
    if (!regionCode) {
      throw new BadRequestException('지역을 판정할 수 없는 좌표입니다');
    }
    const place = await this.repo.create(
      {
        id: this.id.generate(),
        regionCode,
        tourapiContentId: null,
        lat: cmd.lat,
        lng: cmd.lng,
        basePoints: 0,
        rarityWeight: '1.00',
        tags: [],
        status: 'PENDING_REVIEW',
        createdBy: userId,
      },
      [{ locale: 'KO', name: cmd.name, address: cmd.address, description: cmd.description }],
    );
    return { placeId: place.id, status: 'PENDING_REVIEW', regionCode };
  }

  /** Admin offset list. */
  async adminList(params: {
    province?: string;
    status?: PlaceStatus;
    page: number;
    limit: number;
  }) {
    const { rows, total } = await this.repo.listAll({
      province: params.province,
      status: params.status,
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
    });
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  /** 어드민 검수 — 사용자 제출 장소 승인(ACTIVE)/반려(HIDDEN). */
  async setPlaceStatus(
    id: string,
    status: 'ACTIVE' | 'HIDDEN',
  ): Promise<{ id: string; status: PlaceStatus }> {
    const row = await this.repo.setStatus(id, status);
    if (!row) throw new NotFoundException('Place not found');
    return { id: row.id, status: row.status as PlaceStatus };
  }

  /** GPS 근접 여행지 목록 — 거리순. GPS 원본은 판정에만 쓰고 저장하지 않는다. */
  async nearby(params: {
    lat: number;
    lng: number;
    radius?: number;
    limit?: number;
    locale: Locale;
  }): Promise<NearbyItem[]> {
    const radius = params.radius ?? 2000;
    const limit = params.limit ?? 20;
    const rows = await this.repo.nearbyPlaces(params.lat, params.lng, radius, limit);
    const trans = await this.repo.transForMany(
      rows.map((r) => r.id),
      [params.locale, 'KO'],
    );
    return rows.map((r) => {
      const t = this.pickTrans(
        trans.filter((x) => x.placeId === r.id),
        params.locale,
      );
      return {
        placeId: r.id,
        name: t?.name ?? '',
        address: t?.address ?? null,
        distanceM: Math.round(r.distanceM),
        regionCode: r.regionCode,
        thumbnailUrl: r.imageUrl ?? null,
      };
    });
  }

  /** 어드민 — place에 가중치 프로필 연결/해제. */
  async adminSetWeightConfig(placeId: string, configId: string | null): Promise<{ updated: true }> {
    if (configId !== null && !(await this.weightConfigs.exists(configId))) throw new NotFoundException('weight config not found');
    const ok = await this.repo.setWeightConfig(placeId, configId);
    if (!ok) throw new NotFoundException('Place not found');
    return { updated: true };
  }

  /** 어드민 — 대표 이미지 업로드(로컬 스토리지) 후 image_url 갱신. */
  async adminUploadImage(placeId: string, buffer: Buffer, mime: string): Promise<{ imageUrl: string }> {
    if (!(await this.repo.placeExists(placeId))) throw new NotFoundException('Place not found');
    const { key } = await this.storage.save(buffer, mime, 'places');
    const imageUrl = `/api/places/images/${key}`;
    await this.repo.setImageUrl(placeId, imageUrl);
    return { imageUrl };
  }

  /** 어드민 — 대표 이미지 해제(image_url null). */
  async adminDeleteImage(placeId: string): Promise<{ imageUrl: null }> {
    if (!(await this.repo.setImageUrl(placeId, null))) throw new NotFoundException('Place not found');
    return { imageUrl: null };
  }

  /** locale 행 우선, 없으면 KO 폴백. */
  private pickTrans(
    trans: PlaceTrans[],
    locale: Locale,
  ): PlaceTrans | undefined {
    return (
      trans.find((t) => t.locale === locale) ??
      trans.find((t) => t.locale === 'KO')
    );
  }
}
