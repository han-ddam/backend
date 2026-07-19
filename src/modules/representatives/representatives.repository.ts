import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  certifications, certificationImages, places, regions,
  userPlaceRepresentative, userRegionRepresentative,
} from '@db/schema';

@Injectable()
export class RepresentativeRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** place별 오피셜 image_url. */
  async officialImages(placeIds: string[]): Promise<Map<string, string | null>> {
    if (placeIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: places.id, imageUrl: places.imageUrl })
      .from(places)
      .where(inArray(places.id, placeIds));
    return new Map(rows.map((r) => [r.id, r.imageUrl]));
  }

  /** (user,place)별 최신 ACCEPTED 인증의 커버 image_key. */
  async latestCoverByPlace(userId: string, placeIds: string[]): Promise<Map<string, string>> {
    if (placeIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([certifications.placeId], { placeId: certifications.placeId, imageKey: certificationImages.imageKey })
      .from(certifications)
      .innerJoin(certificationImages, and(eq(certificationImages.certId, certifications.id), eq(certificationImages.isRepresentative, true)))
      .where(and(eq(certifications.userId, userId), inArray(certifications.placeId, placeIds), eq(certifications.status, 'ACCEPTED')))
      .orderBy(certifications.placeId, desc(certifications.createdAt), desc(certifications.id));
    return new Map(rows.map((r) => [r.placeId, r.imageKey]));
  }

  /** (user,place) 핀의 image_key. */
  async placePins(userId: string, placeIds: string[]): Promise<Map<string, string>> {
    if (placeIds.length === 0) return new Map();
    const rows = await this.db
      .select({ placeId: userPlaceRepresentative.placeId, imageKey: certificationImages.imageKey })
      .from(userPlaceRepresentative)
      .innerJoin(certificationImages, eq(certificationImages.id, userPlaceRepresentative.certImageId))
      .where(and(eq(userPlaceRepresentative.userId, userId), inArray(userPlaceRepresentative.placeId, placeIds)));
    return new Map(rows.map((r) => [r.placeId, r.imageKey]));
  }

  /** (user,province) 핀의 image_key. */
  async regionPin(userId: string, provinceCode: string): Promise<string | null> {
    const [row] = await this.db
      .select({ imageKey: certificationImages.imageKey })
      .from(userRegionRepresentative)
      .innerJoin(certificationImages, eq(certificationImages.id, userRegionRepresentative.certImageId))
      .where(and(eq(userRegionRepresentative.userId, userId), eq(userRegionRepresentative.provinceCode, provinceCode)));
    return row?.imageKey ?? null;
  }

  /** province 내 내 첫 등록 ACCEPTED 인증의 커버 image_key. */
  async firstCoverInProvince(userId: string, provinceCode: string): Promise<string | null> {
    const [row] = await this.db
      .select({ imageKey: certificationImages.imageKey })
      .from(certifications)
      .innerJoin(certificationImages, and(eq(certificationImages.certId, certifications.id), eq(certificationImages.isRepresentative, true)))
      .innerJoin(places, eq(places.id, certifications.placeId))
      .innerJoin(regions, eq(regions.code, places.regionCode))
      .where(and(eq(certifications.userId, userId), eq(regions.parentCode, provinceCode), eq(certifications.status, 'ACCEPTED')))
      .orderBy(asc(certifications.createdAt), asc(certifications.id))
      .limit(1);
    return row?.imageKey ?? null;
  }

  /** province 오피셜 커버 image_url(ACTIVE place, id ASC 첫 장). */
  async officialRegionCover(provinceCode: string): Promise<string | null> {
    const [row] = await this.db
      .select({ imageUrl: places.imageUrl })
      .from(places)
      .innerJoin(regions, eq(regions.code, places.regionCode))
      .where(and(eq(regions.parentCode, provinceCode), eq(places.status, 'ACTIVE'), isNotNull(places.imageUrl)))
      .orderBy(asc(places.id))
      .limit(1);
    return row?.imageUrl ?? null;
  }

  /** 내 ACCEPTED 인증 이미지 목록 — 피커. place 스코프 or province 스코프. */
  async myPhotosForPlace(userId: string, placeId: string): Promise<{ certImageId: string; imageKey: string; isRepresentative: boolean; createdAt: Date }[]> {
    return this.db
      .select({ certImageId: certificationImages.id, imageKey: certificationImages.imageKey, isRepresentative: certificationImages.isRepresentative, createdAt: certifications.createdAt })
      .from(certifications)
      .innerJoin(certificationImages, eq(certificationImages.certId, certifications.id))
      .where(and(eq(certifications.userId, userId), eq(certifications.placeId, placeId), eq(certifications.status, 'ACCEPTED')))
      .orderBy(desc(certifications.createdAt), asc(certificationImages.seq));
  }

  async myPhotosForProvince(userId: string, provinceCode: string): Promise<{ certImageId: string; imageKey: string; isRepresentative: boolean; createdAt: Date }[]> {
    return this.db
      .select({ certImageId: certificationImages.id, imageKey: certificationImages.imageKey, isRepresentative: certificationImages.isRepresentative, createdAt: certifications.createdAt })
      .from(certifications)
      .innerJoin(certificationImages, eq(certificationImages.certId, certifications.id))
      .innerJoin(places, eq(places.id, certifications.placeId))
      .innerJoin(regions, eq(regions.code, places.regionCode))
      .where(and(eq(certifications.userId, userId), eq(regions.parentCode, provinceCode), eq(certifications.status, 'ACCEPTED')))
      .orderBy(desc(certifications.createdAt), asc(certificationImages.seq));
  }

  /** certImageId가 내 ACCEPTED 인증의 이미지인지 + 그 place/province. 없으면 null. */
  async certImageOwner(userId: string, certImageId: string): Promise<{ placeId: string; provinceCode: string | null } | null> {
    const [row] = await this.db
      .select({ placeId: certifications.placeId, provinceCode: regions.parentCode })
      .from(certificationImages)
      .innerJoin(certifications, eq(certifications.id, certificationImages.certId))
      .innerJoin(places, eq(places.id, certifications.placeId))
      .innerJoin(regions, eq(regions.code, places.regionCode))
      .where(and(eq(certificationImages.id, certImageId), eq(certifications.userId, userId), eq(certifications.status, 'ACCEPTED')));
    return row ?? null;
  }

  async upsertPlacePin(userId: string, placeId: string, certImageId: string): Promise<void> {
    await this.db
      .insert(userPlaceRepresentative)
      .values({ userId, placeId, certImageId })
      .onConflictDoUpdate({ target: [userPlaceRepresentative.userId, userPlaceRepresentative.placeId], set: { certImageId } });
  }
  async deletePlacePin(userId: string, placeId: string): Promise<void> {
    await this.db.delete(userPlaceRepresentative).where(and(eq(userPlaceRepresentative.userId, userId), eq(userPlaceRepresentative.placeId, placeId)));
  }
  async upsertRegionPin(userId: string, provinceCode: string, certImageId: string): Promise<void> {
    await this.db
      .insert(userRegionRepresentative)
      .values({ userId, provinceCode, certImageId })
      .onConflictDoUpdate({ target: [userRegionRepresentative.userId, userRegionRepresentative.provinceCode], set: { certImageId } });
  }
  async deleteRegionPin(userId: string, provinceCode: string): Promise<void> {
    await this.db.delete(userRegionRepresentative).where(and(eq(userRegionRepresentative.userId, userId), eq(userRegionRepresentative.provinceCode, provinceCode)));
  }
}
