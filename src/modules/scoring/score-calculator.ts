/** 점수 계산 SSOT — 미리보기와 적립이 동일 함수를 사용한다. */
export interface ScoreInputs {
  basePoints: number;
  typeWeight: number;
  regionWeight: number;
  rarityWeight: number;
  eventMultiplier: number;
}

export interface ScorePreview extends ScoreInputs {
  action: 'CERT_PHOTO';
  estimatedPoints: number;
}

export function calculateScore(action: 'CERT_PHOTO', inputs: ScoreInputs): ScorePreview {
  const raw =
    inputs.basePoints *
    inputs.typeWeight *
    inputs.regionWeight *
    inputs.rarityWeight *
    inputs.eventMultiplier;
  return { action, ...inputs, estimatedPoints: Math.round(raw * 10) / 10 };
}
