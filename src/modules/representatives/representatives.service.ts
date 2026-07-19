import { BadRequestException, Injectable } from '@nestjs/common';
import { RepresentativeRepository } from './representatives.repository';

const PHOTO = (key: string) => `/api/certifications/photos/${key}`;

@Injectable()
export class RepresentativeService {
  constructor(private readonly repo: RepresentativeRepository) {}

  /** placeId → 도감 썸네일 URL. 핀 → 최신 커버 → 오피셜 → null. */
  async resolvePlaceImages(userId: string | null, placeIds: string[]): Promise<Map<string, string | null>> {
    const official = await this.repo.officialImages(placeIds);
    const result = new Map<string, string | null>();
    if (!userId) {
      for (const id of placeIds) result.set(id, official.get(id) ?? null);
      return result;
    }
    const [covers, pins] = await Promise.all([
      this.repo.latestCoverByPlace(userId, placeIds),
      this.repo.placePins(userId, placeIds),
    ]);
    for (const id of placeIds) {
      const key = pins.get(id) ?? covers.get(id);
      result.set(id, key ? PHOTO(key) : official.get(id) ?? null);
    }
    return result;
  }

  /** province 카드 썸네일 URL. 핀 → 첫 커버 → 오피셜 커버 → null. */
  async resolveRegionImage(userId: string | null, provinceCode: string): Promise<string | null> {
    if (userId) {
      const pin = await this.repo.regionPin(userId, provinceCode);
      if (pin) return PHOTO(pin);
      const first = await this.repo.firstCoverInProvince(userId, provinceCode);
      if (first) return PHOTO(first);
    }
    return this.repo.officialRegionCover(provinceCode);
  }

  async listPlacePhotos(userId: string, placeId: string) {
    const rows = await this.repo.myPhotosForPlace(userId, placeId);
    return rows.map((r) => ({ certImageId: r.certImageId, imageUrl: PHOTO(r.imageKey), isRepresentative: r.isRepresentative, createdAt: r.createdAt.toISOString() }));
  }
  async listRegionPhotos(userId: string, provinceCode: string) {
    const rows = await this.repo.myPhotosForProvince(userId, provinceCode);
    return rows.map((r) => ({ certImageId: r.certImageId, imageUrl: PHOTO(r.imageKey), isRepresentative: r.isRepresentative, createdAt: r.createdAt.toISOString() }));
  }

  async pinPlace(userId: string, placeId: string, certImageId: string): Promise<void> {
    const owner = await this.repo.certImageOwner(userId, certImageId);
    if (!owner || owner.placeId !== placeId) throw new BadRequestException('cert image not eligible for this place');
    await this.repo.upsertPlacePin(userId, placeId, certImageId);
  }
  async unpinPlace(userId: string, placeId: string): Promise<void> {
    await this.repo.deletePlacePin(userId, placeId);
  }
  async pinRegion(userId: string, provinceCode: string, certImageId: string): Promise<void> {
    const owner = await this.repo.certImageOwner(userId, certImageId);
    if (!owner || owner.provinceCode !== provinceCode) throw new BadRequestException('cert image not eligible for this region');
    await this.repo.upsertRegionPin(userId, provinceCode, certImageId);
  }
  async unpinRegion(userId: string, provinceCode: string): Promise<void> {
    await this.repo.deleteRegionPin(userId, provinceCode);
  }
}
