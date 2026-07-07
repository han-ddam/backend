import { Module } from '@nestjs/common';
import { ScoringRepository } from './scoring.repository';
import { ScoringService } from './scoring.service';
import { ScoringController } from './scoring.controller';

@Module({
  controllers: [ScoringController],
  providers: [ScoringRepository, ScoringService],
  exports: [ScoringService], // 후속 인증 플로우가 적립 계산에 재사용
})
export class ScoringModule {}
