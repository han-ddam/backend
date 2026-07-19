import { Module } from '@nestjs/common';
import { RepresentativeService } from './representatives.service';
import { RepresentativeRepository } from './representatives.repository';
import { RepresentativeController } from './representatives.controller';

@Module({
  controllers: [RepresentativeController],
  providers: [RepresentativeService, RepresentativeRepository],
  exports: [RepresentativeService],
})
export class RepresentativesModule {}
