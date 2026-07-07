import { Injectable, NotFoundException } from '@nestjs/common';
import { ScoringRepository } from './scoring.repository';
import { calculateScore, type ScorePreview } from './score-calculator';

const ACTION = 'CERT_PHOTO' as const;

@Injectable()
export class ScoringService {
  constructor(private readonly repo: ScoringRepository) {}

  /** 인증 점수 미리보기 — 유저 무관 계산(게스트 동일). */
  async preview(placeId: string): Promise<ScorePreview> {
    const place = await this.repo.placeForScoring(placeId);
    if (!place) throw new NotFoundException('Place not found');
    const basePoints =
      place.basePoints > 0
        ? place.basePoints
        : ((await this.repo.ruleBasePoints(ACTION)) ?? 0);
    const weight = await this.repo.regionWeight(place.provinceCode);
    return calculateScore(ACTION, {
      basePoints,
      regionWeight: weight === null ? 1.0 : Number(weight),
      rarityWeight: Number(place.rarityWeight),
      eventMultiplier: 1.0,
    });
  }
}
