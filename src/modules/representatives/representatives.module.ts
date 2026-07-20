import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { RepresentativeService } from './representatives.service';
import { RepresentativeRepository } from './representatives.repository';
import { RepresentativeController } from './representatives.controller';

@Module({
  imports: [AuthModule], // 컨트롤러의 JwtAuthGuard → JwtService 제공
  controllers: [RepresentativeController],
  providers: [RepresentativeService, RepresentativeRepository],
  exports: [RepresentativeService],
})
export class RepresentativesModule {}
