import { Module } from '@nestjs/common';
import { GeoService } from './geo.service';

/**
 * Spatial primitives. Exports only GeoService — its public methods are the
 * sole sanctioned way for other modules to do containment/proximity/distance.
 */
@Module({
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
