import { NotFoundException } from '@nestjs/common';
import { RegionsService } from './regions.service';

describe('RegionsService', () => {
  let repo: any;
  let service: RegionsService;

  beforeEach(() => {
    repo = {
      findProvince: jest.fn(),
      regionNames: jest.fn(),
      countPlaces: jest.fn(),
      countVisited: jest.fn(),
      listPlaces: jest.fn(),
      placeTransForMany: jest.fn(),
      listRecommended: jest.fn(),
      listProvinces: jest.fn(),
    };
    service = new RegionsService(repo);
  });

  describe('getRegion', () => {
    it('throws NotFound for unknown/non-province code', async () => {
      repo.findProvince.mockResolvedValue(undefined);
      await expect(service.getRegion('99', 'u1', 'KO')).rejects.toThrow(NotFoundException);
    });

    it('computes percent/remaining and falls back to KO name', async () => {
      repo.findProvince.mockResolvedValue({ code: '32' });
      repo.regionNames.mockResolvedValue([{ locale: 'KO', name: '강원도' }]);
      repo.countPlaces.mockResolvedValue(20);
      repo.countVisited.mockResolvedValue(8);
      const out = await service.getRegion('32', 'u1', 'EN');
      expect(out).toEqual({
        code: '32', name: '강원도', description: null,
        progress: { percent: 40, collected: 8, total: 20, remaining: 12 },
      });
    });

    it('guest sees collected 0 and percent 0 (total 0 safe)', async () => {
      repo.findProvince.mockResolvedValue({ code: '32' });
      repo.regionNames.mockResolvedValue([{ locale: 'KO', name: '강원도' }]);
      repo.countPlaces.mockResolvedValue(0);
      repo.countVisited.mockResolvedValue(0);
      const out = await service.getRegion('32', null, 'KO');
      expect(out.progress).toEqual({ percent: 0, collected: 0, total: 0, remaining: 0 });
      expect(repo.countVisited).not.toHaveBeenCalled();
    });
  });

  describe('listPlaces', () => {
    it('maps visitStatus and builds counts + nextCursor', async () => {
      repo.listPlaces.mockResolvedValue([
        { id: 'p1', createdAt: new Date('2026-07-07T00:00:00Z'), visited: true, imageUrl: 'http://tong/p1.jpg' },
      ]);
      repo.placeTransForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초' },
      ]);
      repo.countPlaces.mockResolvedValue(5);
      repo.countVisited.mockResolvedValue(1);
      const out = await service.listPlaces({
        code: '32', userId: 'u1', onlyVisited: false, locale: 'KO', limit: 20,
      });
      expect(out.items[0]).toEqual({
        placeId: 'p1', name: '영금정', address: '속초', imageUrl: 'http://tong/p1.jpg', visitStatus: 'VISITED',
      });
      expect(out.counts).toEqual({ all: 5, visited: 1, planned: 0 });
      expect(out.nextCursor).toBeNull();
    });

    it('guest + onlyVisited short-circuits to an empty page instead of listing unvisited places', async () => {
      repo.countPlaces.mockResolvedValue(5);
      const out = await service.listPlaces({
        code: '32', userId: null, onlyVisited: true, locale: 'KO', limit: 20,
      });
      expect(out).toEqual({
        items: [],
        counts: { all: 5, visited: 0, planned: 0 },
        nextCursor: null,
      });
      expect(repo.listPlaces).not.toHaveBeenCalled();
      expect(repo.placeTransForMany).not.toHaveBeenCalled();
    });
  });

  describe('listRecommended', () => {
    it('maps recommended items with imageUrl', async () => {
      repo.listRecommended.mockResolvedValue([{ id: 'p2', imageUrl: null }]);
      repo.placeTransForMany.mockResolvedValue([
        { placeId: 'p2', locale: 'KO', name: '설악산', address: '속초' },
      ]);
      const out = await service.listRecommended({ code: '32', userId: 'u1', locale: 'KO', limit: 1 });
      expect(out).toEqual([{ placeId: 'p2', name: '설악산', address: '속초', imageUrl: null }]);
    });
  });

  describe('listRegions', () => {
    it('lists provinces sorted numerically with locale preference and KO fallback', async () => {
      repo.listProvinces.mockResolvedValue([
        { code: '31', locale: 'KO', name: '경기도' },
        { code: '31', locale: 'EN', name: 'Gyeonggi-do' },
        { code: '8', locale: 'KO', name: '세종특별자치시' },
      ]);
      const out = await service.listRegions('EN');
      expect(out).toEqual([
        { code: '8', name: '세종특별자치시' }, // EN 번역 없음 → KO 폴백, 8 < 31 정수 정렬
        { code: '31', name: 'Gyeonggi-do' }, // EN 우선
      ]);
      expect(repo.listProvinces).toHaveBeenCalledWith(['EN', 'KO']);
    });
  });
});
