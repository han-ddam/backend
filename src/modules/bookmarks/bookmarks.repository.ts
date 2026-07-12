import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { userPlaceBookmarks, places } from '@db/schema';

@Injectable()
export class BookmarksRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async placeActive(placeId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.id, placeId), eq(places.status, 'ACTIVE')));
    return !!row;
  }

  /** 찜 추가 — 이미 있으면 무시(멱등). */
  async add(userId: string, placeId: string): Promise<void> {
    await this.db
      .insert(userPlaceBookmarks)
      .values({ userId, placeId })
      .onConflictDoNothing({ target: [userPlaceBookmarks.userId, userPlaceBookmarks.placeId] });
  }

  /** 찜 해제 — 없어도 무시(멱등). */
  async remove(userId: string, placeId: string): Promise<void> {
    await this.db
      .delete(userPlaceBookmarks)
      .where(and(eq(userPlaceBookmarks.userId, userId), eq(userPlaceBookmarks.placeId, placeId)));
  }
}
