import { Injectable, NotFoundException } from '@nestjs/common';
import { RatingsRepository } from './ratings.repository';

@Injectable()
export class RatingsService {
  constructor(private readonly repo: RatingsRepository) {}

  async submit(userId: string, placeId: string, score: number): Promise<{ placeId: string; score: number }> {
    if (!(await this.repo.placeActive(placeId))) {
      throw new NotFoundException('Place not found');
    }
    await this.repo.upsert(userId, placeId, score.toFixed(1));
    return { placeId, score };
  }

  /** 상세용 집계 — 평균(1자리 반올림, 없으면 null), 개수, 내 점수(게스트 null). */
  async aggregateFor(
    placeId: string,
    userId?: string | null,
  ): Promise<{ average: number | null; count: number; myScore: number | null }> {
    const [agg, myScore] = await Promise.all([
      this.repo.aggregate(placeId),
      userId ? this.repo.myScore(userId, placeId) : Promise.resolve(null),
    ]);
    const average = agg.avg !== null ? Math.round(Number(agg.avg) * 10) / 10 : null;
    return { average, count: agg.count, myScore };
  }
}
