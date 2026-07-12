import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IdService } from '@platform/id/id.service';
import { BadgesService } from '@modules/badges/badges.service';
import { VisitsRepository } from './visits.repository';

export interface VisitResult {
  placeId: string;
  visitStatus: 'VISITED';
  visitedAt: string;
}

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly repo: VisitsRepository,
    private readonly id: IdService,
    private readonly badges: BadgesService,
  ) {}

  /** 여행지 방문(수집) 기록 — 멱등(UNIQUE(user,place)). */
  async record(userId: string, placeId: string): Promise<VisitResult> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    const row = await this.repo.record(this.id.generate(), userId, placeId);
    try {
      await this.badges.evaluate(userId);
    } catch (e) {
      this.logger.warn(`badge evaluate failed for ${userId}: ${e}`);
    }
    return { placeId, visitStatus: 'VISITED', visitedAt: row.createdAt.toISOString() };
  }
}
