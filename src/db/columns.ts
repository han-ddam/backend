import { customType } from 'drizzle-orm/pg-core';

/**
 * PostGIS geometry columns. Drizzle's query-builder has no spatial DSL, so we
 * declare the precise SQL column types here and do ALL spatial reads/writes via
 * `sql``` fragments inside the `geo` module (see 02-design.md, Decision B).
 *
 * Values round-trip as WKT/EWKT strings at this layer; callers should wrap with
 * ST_GeomFromText / ST_AsText (or work through GeoService) rather than reading raw.
 */
export const geometryPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Point,4326)';
  },
});

export const geometryMultiPolygon = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'geometry(MultiPolygon,4326)';
  },
});
