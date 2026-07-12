import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { BadgesModule } from '@modules/badges/badges.module';
import { VisitsRepository } from './visits.repository';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';

@Module({
  imports: [AuthModule, BadgesModule], // JwtAuthGuard 사용 (AuthModule이 JwtModule과 함께 export)
  controllers: [VisitsController],
  providers: [VisitsRepository, VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
