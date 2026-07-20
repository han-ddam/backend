import { Module } from '@nestjs/common';
import { AdminModule } from '@modules/admin/admin.module';
import { AuthModule } from '@modules/auth/auth.module';
import { CertificationsModule } from '@modules/certifications/certifications.module';
import { RatingsModule } from '@modules/ratings/ratings.module';
import { ScoringModule } from '@modules/scoring/scoring.module';
import { PlacesRepository } from './places.repository';
import { PlacesService } from './places.service';
import { CompositionsRepository } from './compositions.repository';
import { CompositionsService } from './compositions.service';
import { PlacesController } from './places.controller';
import { AdminPlacesController } from './admin-places.controller';
import { MePlacesController } from './me-places.controller';

@Module({
  imports: [AdminModule, AuthModule, CertificationsModule, RatingsModule, ScoringModule], // admin 가드(AdminJwtGuard/AdminRolesGuard) + JwtAuthGuard 사용 + weight-config 존재 확인
  controllers: [PlacesController, AdminPlacesController, MePlacesController],
  providers: [PlacesRepository, PlacesService, CompositionsRepository, CompositionsService],
  exports: [PlacesService, CompositionsService],
})
export class PlacesModule {}
