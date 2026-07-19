import { Module } from '@nestjs/common';
import { VisitsRepository } from './visits.repository';

@Module({
  providers: [VisitsRepository],
})
export class VisitsModule {}
