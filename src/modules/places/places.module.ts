import { Module } from '@nestjs/common';
import { AdminModule } from '@modules/admin/admin.module';
import { PlacesRepository } from './places.repository';
import { PlacesService } from './places.service';
import { PlacesController } from './places.controller';
import { AdminPlacesController } from './admin-places.controller';

@Module({
  imports: [AdminModule], // admin 가드(AdminJwtGuard/AdminRolesGuard) 사용
  controllers: [PlacesController, AdminPlacesController],
  providers: [PlacesRepository, PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
