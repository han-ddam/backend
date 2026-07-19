import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ScoringService } from '@modules/scoring/scoring.service';
import { BadgesService } from '@modules/badges/badges.service';
import { CertificationsRepository } from './certifications.repository';
import { VERIFIER, type VerifierPort } from './verify/verifier.port';

/** 'certification' 큐 소비 — 검증(VerifierPort) → 통과 시 적립(첫 수집 ×1 + visit, 재방문 ×0.5). 워커에서 활성. */
@Processor('certification')
export class CertificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(CertificationsProcessor.name);

  constructor(
    private readonly repo: CertificationsRepository,
    @Inject(VERIFIER) private readonly verifier: VerifierPort,
    private readonly scoring: ScoringService,
    private readonly badges: BadgesService,
  ) {
    super();
  }

  async process(job: Job<{ certId: string }>): Promise<void> {
    const cert = await this.repo.findById(job.data.certId);
    if (!cert || cert.status !== 'PENDING' || cert.scoredAt) return; // 멱등

    const coverKey = await this.repo.coverImageKey(cert.id);
    const result = await this.verifier.verify({
      id: cert.id,
      placeId: cert.placeId,
      imageKey: coverKey ?? '',
    });
    if (!result.pass) {
      await this.repo.reject(cert.id, result.reason ?? 'VERIFICATION_FAILED');
      return;
    }

    const preview = await this.scoring.preview(cert.placeId, 'PHOTO');
    const accrual = await this.repo.applyAccrual({
      certId: cert.id,
      userId: cert.userId,
      placeId: cert.placeId,
      type: 'PHOTO',
      preview,
    });
    if (accrual.awarded) {
      try {
        await this.badges.evaluate(cert.userId);
      } catch (e) {
        this.logger.warn(`badge evaluate failed for ${cert.userId}: ${e}`);
      }
    }
  }
}
