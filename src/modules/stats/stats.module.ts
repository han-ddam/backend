import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { StatsRepository } from './stats.repository';
import { StatsService } from './stats.service';

@Module({
  imports: [AuthModule, DogamModule], // JwtAuthGuard, DogamService(overview)
  providers: [StatsRepository, StatsService],
  exports: [StatsService],
})
export class StatsModule {}
