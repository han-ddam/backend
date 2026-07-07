import { Module } from '@nestjs/common';
import { AdminModule } from '@modules/admin/admin.module';
import { AuthModule } from '@modules/auth/auth.module';
import { PlacesRepository } from './places.repository';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { AdminPlacesController } from './admin-places.controller';
import { MePlacesController } from './me-places.controller';

@Module({
  imports: [AdminModule, AuthModule], // admin 가드(AdminJwtGuard/AdminRolesGuard) + JwtAuthGuard 사용
  controllers: [PlacesController, AdminPlacesController, MePlacesController],
  providers: [PlacesRepository, PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
