import { NotFoundException } from '@nestjs/common';
import { ScoringService } from './scoring.service';

describe('ScoringService', () => {
  let repo: any;
  let service: ScoringService;

  beforeEach(() => {
    repo = {
      placeForScoring: jest.fn(),
      ruleBasePoints: jest.fn(),
      regionWeight: jest.fn(),
    };
    service = new ScoringService(repo);
  });

  it('uses place.basePoints when set (>0) without consulting score_rule', async () => {
    repo.placeForScoring.mockResolvedValue({
      basePoints: 20,
      rarityWeight: '1.20',
      provinceCode: '39',
    });
    repo.regionWeight.mockResolvedValue('1.50');
    const out = await service.preview('p1');
    expect(out.basePoints).toBe(20);
    expect(out.regionWeight).toBe(1.5);
    expect(out.rarityWeight).toBe(1.2);
    expect(out.estimatedPoints).toBe(36);
    expect(repo.ruleBasePoints).not.toHaveBeenCalled();
  });

  it('falls back to score_rule when place.basePoints is 0', async () => {
    repo.placeForScoring.mockResolvedValue({
      basePoints: 0,
      rarityWeight: '1.00',
      provinceCode: '39',
    });
    repo.ruleBasePoints.mockResolvedValue(15);
    repo.regionWeight.mockResolvedValue(null);
    const out = await service.preview('p1');
    expect(repo.ruleBasePoints).toHaveBeenCalledWith('CERT_PHOTO');
    expect(out).toEqual({
      action: 'CERT_PHOTO',
      basePoints: 15,
      typeWeight: 1,
      regionWeight: 1,
      rarityWeight: 1,
      eventMultiplier: 1,
      estimatedPoints: 15,
    });
  });

  it('defaults basePoints to 0 when rule row is missing (defensive, no 500)', async () => {
    repo.placeForScoring.mockResolvedValue({
      basePoints: 0,
      rarityWeight: '1.00',
      provinceCode: '39',
    });
    repo.ruleBasePoints.mockResolvedValue(null);
    repo.regionWeight.mockResolvedValue(null);
    const out = await service.preview('p1');
    expect(out.estimatedPoints).toBe(0);
  });

  it('throws NotFound when place is missing or hidden', async () => {
    repo.placeForScoring.mockResolvedValue(null);
    await expect(service.preview('nope')).rejects.toThrow(NotFoundException);
    expect(repo.regionWeight).not.toHaveBeenCalled();
  });
});
