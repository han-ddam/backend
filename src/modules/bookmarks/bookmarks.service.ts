import { Injectable, NotFoundException } from '@nestjs/common';
import { buildCursorPage, type CursorPage } from '@platform/pagination/cursor';
import { BookmarksRepository, type Locale } from './bookmarks.repository';

export interface BookmarkListItem {
  id: string;
  name: string;
  regionCode: string;
  imageUrl: string | null;
  visitStatus: 'VISITED' | 'PLANNED';
  bookmarkedAt: string; // ISO
}

@Injectable()
export class BookmarksService {
  constructor(private readonly repo: BookmarksRepository) {}

  async add(userId: string, placeId: string): Promise<{ placeId: string; bookmarked: true }> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    await this.repo.add(userId, placeId);
    return { placeId, bookmarked: true };
  }

  async remove(userId: string, placeId: string): Promise<{ placeId: string; bookmarked: false }> {
    await this.repo.remove(userId, placeId);
    return { placeId, bookmarked: false };
  }

  async list(params: {
    userId: string;
    locale: Locale;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPage<BookmarkListItem>> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const rows = await this.repo.listByUser({
      userId: params.userId,
      cursor: params.cursor,
      limit,
    });
    const page = buildCursorPage(rows, limit);
    const trans = await this.repo.transForMany(
      page.items.map((r) => r.id),
      [params.locale, 'KO'],
    );
    return {
      items: page.items.map((r) => {
        const t =
          trans.find((x) => x.placeId === r.id && x.locale === params.locale) ??
          trans.find((x) => x.placeId === r.id && x.locale === 'KO');
        return {
          id: r.id,
          name: t?.name ?? '',
          regionCode: r.regionCode,
          imageUrl: r.imageUrl ?? null,
          visitStatus: r.visited ? ('VISITED' as const) : ('PLANNED' as const),
          bookmarkedAt: r.createdAt.toISOString(),
        };
      }),
      nextCursor: page.nextCursor,
    };
  }
}
