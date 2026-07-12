import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { BadgesModule } from '@modules/badges/badges.module';
import { StatsRepository } from './stats.repository';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [AuthModule, DogamModule, BadgesModule], // JwtAuthGuard, DogamService(overview), BadgesService(representativeFor)
  controllers: [StatsController],
  providers: [StatsRepository, StatsService],
  exports: [StatsService],
})
export class StatsModule {}
