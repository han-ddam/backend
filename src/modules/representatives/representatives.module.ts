import { Module } from '@nestjs/common';
import { RepresentativeService } from './representatives.service';
import { RepresentativeRepository } from './representatives.repository';

@Module({
  providers: [RepresentativeService, RepresentativeRepository],
  exports: [RepresentativeService],
})
export class RepresentativesModule {}
