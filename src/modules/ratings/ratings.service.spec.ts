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
      setComment: jest.fn(),
      reviewsForPlace: jest.fn(),
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
      repo.aggregate.mockResolvedValue({ avg: '4.833333', count: 3, reviewCount: 1 });
      repo.myScore.mockResolvedValue(4.5);
      const out = await service.aggregateFor('p1', 'u1');
      expect(out).toEqual({ average: 4.8, count: 3, myScore: 4.5, reviewCount: 1 });
    });

    it('no ratings → average null, count 0; guest → myScore null (no query)', async () => {
      repo.aggregate.mockResolvedValue({ avg: null, count: 0, reviewCount: 0 });
      const out = await service.aggregateFor('p1', null);
      expect(out).toEqual({ average: null, count: 0, myScore: null, reviewCount: 0 });
      expect(repo.myScore).not.toHaveBeenCalled();
    });
  });

  describe('submitReview', () => {
    it('400 when no rating row exists', async () => {
      repo.setComment.mockResolvedValue(false);
      await expect(service.submitReview('u1', 'p1', '좋아요')).rejects.toThrow('Rate the place first');
    });
    it('sets comment and returns it', async () => {
      repo.setComment.mockResolvedValue(true);
      const out = await service.submitReview('u1', 'p1', '정자 뷰 최고');
      expect(repo.setComment).toHaveBeenCalledWith('u1', 'p1', '정자 뷰 최고');
      expect(out).toEqual({ placeId: 'p1', comment: '정자 뷰 최고' });
    });
  });

  describe('deleteReview', () => {
    it('clears comment (idempotent) and returns null', async () => {
      repo.setComment.mockResolvedValue(true);
      const out = await service.deleteReview('u1', 'p1');
      expect(repo.setComment).toHaveBeenCalledWith('u1', 'p1', null);
      expect(out).toEqual({ placeId: 'p1', comment: null });
    });
  });

  describe('reviewsFor', () => {
    it('maps rows to items + nextCursor (keyset on updatedAt/userId)', async () => {
      repo.reviewsForPlace.mockResolvedValue([
        { userId: 'u2', score: '4.5', comment: '좋아요', updatedAt: new Date('2026-07-13T00:00:00Z'), handle: '@b' },
        { userId: 'u1', score: '3.0', comment: '보통', updatedAt: new Date('2026-07-12T00:00:00Z'), handle: '@a' },
      ]);
      const out = await service.reviewsFor('p1', undefined, 1);
      expect(repo.reviewsForPlace).toHaveBeenCalledWith('p1', undefined, 1);
      expect(out.items).toEqual([
        { userHandle: '@b', score: 4.5, comment: '좋아요', updatedAt: '2026-07-13T00:00:00.000Z' },
      ]);
      expect(out.nextCursor).not.toBeNull();
    });
    it('empty → items [] nextCursor null', async () => {
      repo.reviewsForPlace.mockResolvedValue([]);
      const out = await service.reviewsFor('p1', undefined, 10);
      expect(out).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('aggregateFor reviewCount', () => {
    it('includes reviewCount from aggregate', async () => {
      repo.aggregate.mockResolvedValue({ avg: '4.0', count: 3, reviewCount: 2 });
      const out = await service.aggregateFor('p1', null);
      expect(out).toEqual({ average: 4, count: 3, myScore: null, reviewCount: 2 });
    });
  });
});
