import { Injectable, NotFoundException } from '@nestjs/common';
import { BookmarksRepository } from './bookmarks.repository';

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
}
