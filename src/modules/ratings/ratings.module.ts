import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { RatingsRepository } from './ratings.repository';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';

@Module({
  imports: [AuthModule], // JwtAuthGuard
  providers: [RatingsRepository, RatingsService],
  controllers: [RatingsController],
  exports: [RatingsService],
})
export class RatingsModule {}
