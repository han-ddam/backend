import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { buildCursorPage } from '@platform/pagination/cursor';
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
  ): Promise<{ average: number | null; count: number; myScore: number | null; reviewCount: number }> {
    const [agg, myScore] = await Promise.all([
      this.repo.aggregate(placeId),
      userId ? this.repo.myScore(userId, placeId) : Promise.resolve(null),
    ]);
    const average = agg.avg !== null ? Math.round(Number(agg.avg) * 10) / 10 : null;
    return { average, count: agg.count, myScore, reviewCount: agg.reviewCount };
  }

  /** 후기 작성/수정 — 별점 선행 필수(행 없으면 400). */
  async submitReview(userId: string, placeId: string, comment: string): Promise<{ placeId: string; comment: string }> {
    const ok = await this.repo.setComment(userId, placeId, comment);
    if (!ok) throw new BadRequestException('Rate the place first');
    return { placeId, comment };
  }

  /** 후기 삭제 — comment null(별점 유지), 멱등. */
  async deleteReview(userId: string, placeId: string): Promise<{ placeId: string; comment: null }> {
    await this.repo.setComment(userId, placeId, null);
    return { placeId, comment: null };
  }

  /** place 공개 리뷰 목록 — updated_at 키셋 커서. */
  async reviewsFor(
    placeId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ items: { userHandle: string; score: number; comment: string; updatedAt: string }[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const rows = await this.repo.reviewsForPlace(placeId, cursor, lim);
    // 복합PK라 id 없음 → user_id를 id로, updated_at을 createdAt으로 매핑해 커서 헬퍼 재사용.
    const page = buildCursorPage(
      rows.map((r) => ({ ...r, createdAt: r.updatedAt, id: r.userId })),
      lim,
    );
    return {
      items: page.items.map((r) => ({
        userHandle: r.handle,
        score: Number(r.score),
        comment: r.comment,
        updatedAt: r.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
