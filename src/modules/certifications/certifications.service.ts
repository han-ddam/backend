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
}
