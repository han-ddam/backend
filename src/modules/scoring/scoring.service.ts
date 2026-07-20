import { Injectable, NotFoundException } from '@nestjs/common';
import { ScoringRepository } from './scoring.repository';
import { calculateScore, type ScorePreview } from './score-calculator';

const ACTION = 'CERT_PHOTO' as const;

@Injectable()
export class ScoringService {
  constructor(private readonly repo: ScoringRepository) {}

  /** 인증 점수 미리보기 — type별 place 가중치 반영(유저 무관). */
  async preview(placeId: string, type: 'VISIT' | 'PHOTO'): Promise<ScorePreview> {
    const place = await this.repo.placeForScoring(placeId);
    if (!place) throw new NotFoundException('Place not found');
    const basePoints =
      place.basePoints > 0 ? place.basePoints : ((await this.repo.ruleBasePoints(ACTION)) ?? 0);
    const weight = await this.repo.regionWeight(place.provinceCode);
    const typeWeight = type === 'VISIT' ? Number(place.visitWeight) : Number(place.photoWeight);
    return calculateScore(ACTION, {
      basePoints,
      typeWeight,
      regionWeight: weight === null ? 1.0 : Number(weight),
      rarityWeight: Number(place.rarityWeight),
      eventMultiplier: 1.0,
    });
  }
}
