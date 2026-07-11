import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Env } from '@platform/config/env';
import { IdService } from '@platform/id/id.service';
import { GeoService } from '@modules/geo/geo.service';
import { CertificationsRepository } from './certifications.repository';
import { STORAGE, type StoragePort } from './storage/storage.port';
import { SubmitCertificationDto } from './dto/certification.dto';

export interface SubmitResult {
  certId: string;
  status: 'PENDING' | 'REJECTED';
  proximityPass: boolean;
}

/** LocalStorage가 실제로 채번하는 키 형식만 허용 (경로 순회 방지). */
const SAFE_IMAGE_KEY = /^certifications\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

@Injectable()
export class CertificationsService {
  constructor(
    private readonly repo: CertificationsRepository,
    private readonly geo: GeoService,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @InjectQueue('certification') private readonly queue: Queue,
    private readonly id: IdService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async uploadPhoto(buffer: Buffer, mime: string): Promise<{ imageKey: string }> {
    const { key } = await this.storage.save(buffer, mime);
    return { imageKey: key };
  }

  async submit(userId: string, dto: SubmitCertificationDto): Promise<SubmitResult> {
    // 멱등: 같은 (user,imageKey)면 기존 결과 반환
    const existing = await this.repo.findByUserImageKey(userId, dto.imageKey);
    if (existing) {
      return {
        certId: existing.id,
        status: existing.status as 'PENDING' | 'REJECTED',
        proximityPass: existing.proximityPass,
      };
    }
    const coords = await this.repo.placeCoords(dto.placeId);
    if (!coords) throw new NotFoundException('Place not found');
    if (!(await this.storage.exists(dto.imageKey))) {
      throw new BadRequestException('imageKey not found');
    }

    const device = { lng: dto.deviceLng, lat: dto.deviceLat };
    const target = { lng: coords.lng, lat: coords.lat };
    const radius = this.config.get('PROXIMITY_TOLERANCE_M', { infer: true });
    const distanceM = await this.geo.distanceMeters(device, target);
    const within = await this.geo.isWithin(device, target, radius);

    const certId = this.id.generate();
    const base = {
      id: certId,
      userId,
      placeId: dto.placeId,
      imageKey: dto.imageKey,
      caption: dto.caption,
      visibility: dto.visibility,
      distanceM,
    };
    if (!within) {
      await this.repo.createRejected({ ...base, reason: 'OUT_OF_RANGE' });
      return { certId, status: 'REJECTED', proximityPass: false };
    }
    await this.repo.createPending(base);
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
}
