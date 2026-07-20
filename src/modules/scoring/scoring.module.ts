import { Module } from '@nestjs/common';
import { AdminModule } from '@modules/admin/admin.module';
import { ScoringRepository } from './scoring.repository';
import { ScoringService } from './scoring.service';
import { ScoringController } from './scoring.controller';
import { WeightConfigsRepository } from './weight-configs.repository';
import { WeightConfigsService } from './weight-configs.service';
import { AdminWeightConfigsController } from './admin-weight-configs.controller';

@Module({
  imports: [AdminModule], // AdminJwtGuard/AdminRolesGuard 제공처
  controllers: [ScoringController, AdminWeightConfigsController],
  providers: [ScoringRepository, ScoringService, WeightConfigsRepository, WeightConfigsService],
  exports: [ScoringService, WeightConfigsService], // 후속 인증 플로우가 적립 계산에 재사용 + places가 config 존재확인에 사용
})
export class ScoringModule {}
