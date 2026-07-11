import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { RegionsModule } from '@modules/regions/regions.module';
import { DogamRepository } from './dogam.repository';
import { DogamService } from './dogam.service';

@Module({
  imports: [AuthModule, RegionsModule], // JwtAuthGuard, RegionsService(listRegions)
  providers: [DogamRepository, DogamService],
  exports: [DogamService],
})
export class DogamModule {}
