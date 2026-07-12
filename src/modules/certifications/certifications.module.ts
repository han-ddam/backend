import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '@modules/auth/auth.module';
import { GeoModule } from '@modules/geo/geo.module';
import { ScoringModule } from '@modules/scoring/scoring.module';
import { BadgesModule } from '@modules/badges/badges.module';
import { CertificationsController } from './certifications.controller';
import { CertificationsRepository } from './certifications.repository';
import { CertificationsService } from './certifications.service';
import { CertificationsProcessor } from './certifications.processor';
import { VERIFIER } from './verify/verifier.port';
import { MockVerifier } from './verify/mock-verifier';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'certification' }),
    AuthModule, // JwtAuthGuard
    GeoModule, // 근접판정
    ScoringModule, // 적립 점수(preview) — 프로세서(Task6)에서 사용
    BadgesModule, // 적립 성공 시 뱃지 재평가
  ],
  controllers: [CertificationsController],
  providers: [
    CertificationsRepository,
    CertificationsService,
    CertificationsProcessor,
    { provide: VERIFIER, useClass: MockVerifier },
  ],
  exports: [CertificationsService],
})
export class CertificationsModule {}
