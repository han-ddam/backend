import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { StatsModule } from '@modules/stats/stats.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { HomeRepository } from './home.repository';
import { HomeService } from './home.service';
import { HomeController } from './home.controller';

@Module({
  imports: [AuthModule, StatsModule, DogamModule], // JwtAuthGuard, StatsService, DogamService
  controllers: [HomeController],
  providers: [HomeRepository, HomeService],
  exports: [HomeService],
})
export class HomeModule {}
