import { Injectable, NotFoundException } from '@nestjs/common';
import { IdService } from '@platform/id/id.service';
import { VisitsRepository } from './visits.repository';

export interface VisitResult {
  placeId: string;
  visitStatus: 'VISITED';
  visitedAt: string;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly repo: VisitsRepository,
    private readonly id: IdService,
  ) {}

  /** 여행지 방문(수집) 기록 — 멱등(UNIQUE(user,place)). */
  async record(userId: string, placeId: string): Promise<VisitResult> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    const row = await this.repo.record(this.id.generate(), userId, placeId);
    return { placeId, visitStatus: 'VISITED', visitedAt: row.createdAt.toISOString() };
  }
}
