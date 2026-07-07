import { calculateScore } from './score-calculator';

describe('calculateScore', () => {
  it('multiplies base × region × rarity × event and echoes inputs', () => {
    const out = calculateScore('CERT_PHOTO', {
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1.0,
      eventMultiplier: 1.0,
    });
    expect(out).toEqual({
      action: 'CERT_PHOTO',
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1.0,
      eventMultiplier: 1.0,
      estimatedPoints: 22.5,
    });
  });

  it('rounds estimatedPoints to one decimal place', () => {
    const out = calculateScore('CERT_PHOTO', {
      basePoints: 10,
      regionWeight: 1.333,
      rarityWeight: 1.0,
      eventMultiplier: 1.0,
    });
    expect(out.estimatedPoints).toBe(13.3);
  });

  it('returns 0 when basePoints is 0', () => {
    const out = calculateScore('CERT_PHOTO', {
      basePoints: 0,
      regionWeight: 1.5,
      rarityWeight: 1.2,
      eventMultiplier: 1.0,
    });
    expect(out.estimatedPoints).toBe(0);
  });
});
