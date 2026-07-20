import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Env } from '@platform/config/env';
import { IdService } from '@platform/id/id.service';
import { GeoService } from '@modules/geo/geo.service';
import { ScoringService } from '@modules/scoring/scoring.service';
import { BadgesService } from '@modules/badges/badges.service';
import { CertificationsRepository } from './certifications.repository';
import { STORAGE, type StoragePort } from '@platform/storage/storage.port';
import { SubmitCertificationDto } from './dto/certification.dto';
import { buildCursorPage } from '@platform/pagination/cursor';

export interface SubmitResult {
  certId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  proximityPass: boolean;
}

/** LocalStorage가 실제로 채번하는 키 형식만 허용 (경로 순회 방지). */
const SAFE_IMAGE_KEY = /^certifications\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

@Injectable()
export class CertificationsService {
  private readonly logger = new Logger(CertificationsService.name);

  constructor(
    private readonly repo: CertificationsRepository,
    private readonly geo: GeoService,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @InjectQueue('certification') private readonly queue: Queue,
    private readonly id: IdService,
    private readonly config: ConfigService<Env, true>,
    private readonly scoring: ScoringService,
    private readonly badges: BadgesService,
  ) {}

  async uploadPhoto(buffer: Buffer, mime: string): Promise<{ imageKey: string }> {
    const { key } = await this.storage.save(buffer, mime);
    return { imageKey: key };
  }

  async submit(userId: string, dto: SubmitCertificationDto): Promise<SubmitResult> {
    // 멱등/중복: 사진 있을 때만 imageKey로 판정(0장은 매번 새 인증)
    if (dto.imageKeys.length > 0) {
      const existing = await this.repo.findCertByImageKey(dto.imageKeys[0]);
      if (existing) {
        if (existing.userId !== userId) throw new BadRequestException('imageKey already used');
        if (existing.status === 'PENDING') await this.queue.add('verify', { certId: existing.id });
        return { certId: existing.id, status: existing.status as SubmitResult['status'], proximityPass: existing.proximityPass };
      }
    }
    const coords = await this.repo.placeCoords(dto.placeId);
    if (!coords) throw new NotFoundException('Place not found');
    const COOLDOWN_DAYS = 7;
    if (await this.repo.recentCertExists(userId, dto.placeId, COOLDOWN_DAYS)) {
      throw new ConflictException('재인증은 마지막 인증 후 7일 경과 후 가능합니다');
    }
    for (const key of dto.imageKeys) {
      if (!(await this.storage.exists(key))) throw new BadRequestException('imageKey not found');
    }

    const device = { lng: dto.deviceLng, lat: dto.deviceLat };
    const target = { lng: coords.lng, lat: coords.lat };
    const radius = this.config.get('PROXIMITY_TOLERANCE_M', { infer: true });
    const distanceM = await this.geo.distanceMeters(device, target);
    const within = await this.geo.isWithin(device, target, radius);

    const certId = this.id.generate();
    const images = dto.imageKeys.map((imageKey, i) => ({ imageKey, seq: i, isRepresentative: i === dto.representativeIndex }));
    const base = { id: certId, userId, placeId: dto.placeId, caption: dto.caption, visibility: dto.visibility, distanceM, images };
    if (!within) {
      await this.repo.createRejected({ ...base, reason: 'OUT_OF_RANGE' });
      return { certId, status: 'REJECTED', proximityPass: false };
    }
    await this.repo.createPending(base);
    if (dto.imageKeys.length === 0) {
      // 방문(0장): 검증 없이 즉시 적립
      const preview = await this.scoring.preview(dto.placeId, 'VISIT');
      const accrual = await this.repo.applyAccrual({ certId, userId, placeId: dto.placeId, type: 'VISIT', preview });
      if (accrual.awarded) {
        try { await this.badges.evaluate(userId); } catch (e) { this.logger.warn(`badge evaluate failed for ${userId}: ${e}`); }
      }
      return { certId, status: 'ACCEPTED', proximityPass: true };
    }
    await this.queue.add('verify', { certId });
    return { certId, status: 'PENDING', proximityPass: true };
  }

  async getCertification(userId: string, id: string) {
    const result = await this.repo.getResult(id, userId);
    if (!result) throw new NotFoundException('Certification not found');
    return result;
  }

  /**
   * 사진 접근 가능 여부 — PUBLIC이면 누구나, PRIVATE이면 본인만. 접근 불가/없음이면 null.
   * 클라이언트가 보낸 key가 채번 형식(`certifications/<id>.<ext>`)이 아니면 스토리지를
   * 조회하지 않고 즉시 null(→ 404) — 경로 순회(`..`, 절대경로 등) 방지.
   */
  async getPhotoMeta(imageKey: string, userId: string | null): Promise<{ ok: true } | null> {
    if (!SAFE_IMAGE_KEY.test(imageKey)) return null;
    const cert = await this.repo.findByImageKey(imageKey);
    if (!cert) return null;
    if (cert.visibility === 'PUBLIC') return { ok: true };
    if (userId && cert.userId === userId) return { ok: true };
    return null;
  }

  /** place 공개 인증사진 피드 — 다른 여행자들의 PUBLIC·ACCEPTED 사진, 커서 페이지. */
  async publicFeedForPlace(
    placeId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: { images: { imageUrl: string; isRepresentative: boolean }[]; coverImageUrl: string | null; userHandle: string; createdAt: Date }[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const rows = await this.repo.publicFeedForPlace(placeId, cursor, lim);
    const page = buildCursorPage(rows, lim);
    return {
      items: page.items.map((r) => {
        const images = r.images.map((im) => ({ imageUrl: `/api/certifications/photos/${im.imageKey}`, isRepresentative: im.isRepresentative }));
        const cover = images.find((i) => i.isRepresentative) ?? images[0] ?? null;
        return { images, coverImageUrl: cover?.imageUrl ?? null, userHandle: r.handle, createdAt: r.createdAt };
      }),
      nextCursor: page.nextCursor,
    };
  }
}
