import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';

export interface LngLat {
  lng: number;
  lat: number;
}

/**
 * The ONLY place spatial SQL lives (02-design.md, Decision B). Every ST_* call
 * is a typed `sql``` fragment here, so proximity/containment is centralized and
 * testable against a real PostGIS test DB. The rest of the app stays in the
 * Drizzle query-builder DSL and never touches raw geometry.
 */
@Injectable()
export class GeoService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /** 시·군·구 code whose polygon contains the point, or null (offshore/boundary). */
  async regionContaining(point: LngLat): Promise<string | null> {
    const rows = await this.db.execute<{ code: string }>(sql`
      SELECT code
      FROM region
      WHERE ST_Contains(
        boundary,
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
      )
      LIMIT 1
    `);
    return rows.at(0)?.code ?? null;
  }

  /** Great-circle distance in meters between two points (geography cast). */
  async distanceMeters(a: LngLat, b: LngLat): Promise<number> {
    const rows = await this.db.execute<{ meters: number }>(sql`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${a.lng}, ${a.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${b.lng}, ${b.lat}), 4326)::geography
      ) AS meters
    `);
    return Number(rows.at(0)?.meters ?? Number.POSITIVE_INFINITY);
  }

  /**
   * True when `point` is within `meters` of `target` — the certification
   * fast-path proximity gate (uses ST_DWithin on geography for accuracy).
   */
  async isWithin(point: LngLat, target: LngLat, meters: number): Promise<boolean> {
    const rows = await this.db.execute<{ ok: boolean }>(sql`
      SELECT ST_DWithin(
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${target.lng}, ${target.lat}), 4326)::geography,
        ${meters}
      ) AS ok
    `);
    return rows.at(0)?.ok ?? false;
  }
}
