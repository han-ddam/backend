import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { visits, places } from '@db/schema';

@Injectable()
export class VisitsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  async record(id: string, userId: string, placeId: string): Promise<{ createdAt: Date }> {
    await this.db
      .insert(visits)
      .values({ id, userId, placeId })
      .onConflictDoNothing({ target: [visits.userId, visits.placeId] });
    const [row] = await this.db
      .select({ createdAt: visits.createdAt })
      .from(visits)
      .where(and(eq(visits.userId, userId), eq(visits.placeId, placeId)));
    return row;
  }
}
