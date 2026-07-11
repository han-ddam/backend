import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { RegionsModule } from '@modules/regions/regions.module';
import { DogamRepository } from './dogam.repository';
import { DogamService } from './dogam.service';
import { DogamController } from './dogam.controller';

@Module({
  imports: [AuthModule, RegionsModule], // JwtAuthGuard, RegionsService(listRegions)
  providers: [DogamRepository, DogamService],
  controllers: [DogamController],
  exports: [DogamService],
})
export class DogamModule {}
