import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { RepresentativesModule } from '@modules/representatives/representatives.module';
import { RegionsRepository } from './regions.repository';
import { RegionsService } from './regions.service';
import { RegionsController } from './regions.controller';

@Module({
  imports: [AuthModule, RepresentativesModule], // OptionalJwtAuthGuard 사용 (AuthModule이 JwtModule과 함께 export), RepresentativeService(resolver)
  controllers: [RegionsController],
  providers: [RegionsRepository, RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}
