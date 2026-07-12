import { NotFoundException } from '@nestjs/common';
import { RatingsService } from './ratings.service';

describe('RatingsService', () => {
  let repo: any, service: RatingsService;

  beforeEach(() => {
    repo = {
      placeActive: jest.fn(),
      upsert: jest.fn(),
      aggregate: jest.fn(),
      myScore: jest.fn(),
    };
    service = new RatingsService(repo);
  });

  describe('submit', () => {
    it('404 when place not ACTIVE', async () => {
      repo.placeActive.mockResolvedValue(false);
      await expect(service.submit('u1', 'p1', 4.5)).rejects.toThrow(NotFoundException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('upserts score as fixed-1 string and returns {placeId, score}', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.upsert.mockResolvedValue(undefined);
      const out = await service.submit('u1', 'p1', 4.5);
      expect(repo.upsert).toHaveBeenCalledWith('u1', 'p1', '4.5');
      expect(out).toEqual({ placeId: 'p1', score: 4.5 });
    });
  });

  describe('aggregateFor', () => {
    it('rounds average to 1 decimal, maps count + myScore', async () => {
      repo.aggregate.mockResolvedValue({ avg: '4.833333', count: 3 });
      repo.myScore.mockResolvedValue(4.5);
      const out = await service.aggregateFor('p1', 'u1');
      expect(out).toEqual({ average: 4.8, count: 3, myScore: 4.5 });
    });

    it('no ratings → average null, count 0; guest → myScore null (no query)', async () => {
      repo.aggregate.mockResolvedValue({ avg: null, count: 0 });
      const out = await service.aggregateFor('p1', null);
      expect(out).toEqual({ average: null, count: 0, myScore: null });
      expect(repo.myScore).not.toHaveBeenCalled();
    });
  });
});
