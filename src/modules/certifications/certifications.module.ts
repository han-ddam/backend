import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '@modules/auth/auth.module';
import { GeoModule } from '@modules/geo/geo.module';
import { ScoringModule } from '@modules/scoring/scoring.module';
import { CertificationsRepository } from './certifications.repository';
import { CertificationsService } from './certifications.service';
import { STORAGE } from './storage/storage.port';
import { LocalStorage } from './storage/local-storage';
import { VERIFIER } from './verify/verifier.port';
import { MockVerifier } from './verify/mock-verifier';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'certification' }),
    AuthModule, // JwtAuthGuard
    GeoModule, // 근접판정
    ScoringModule, // 적립 점수(preview) — 프로세서(Task6)에서 사용
  ],
  providers: [
    CertificationsRepository,
    CertificationsService,
    { provide: STORAGE, useClass: LocalStorage },
    { provide: VERIFIER, useClass: MockVerifier },
  ],
  exports: [CertificationsService],
})
export class CertificationsModule {}
