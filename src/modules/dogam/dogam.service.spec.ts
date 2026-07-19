import { DogamService } from './dogam.service';

describe('DogamService', () => {
  let repo: any, regionsSvc: any, rep: any, service: DogamService;

  beforeEach(() => {
    repo = {
      overview: jest.fn(),
      regionTotals: jest.fn(),
      regionVisited: jest.fn(),
      recentVisitsPage: jest.fn(),
      placeNames: jest.fn(),
    };
    regionsSvc = { listRegions: jest.fn() };
    rep = {
      resolvePlaceImages: jest.fn().mockResolvedValue(new Map()),
      resolveRegionImage: jest.fn().mockResolvedValue(null),
    };
    service = new DogamService(repo, regionsSvc, rep);
  });

  describe('overview', () => {
    it('computes percent from collected/total (rounded)', async () => {
      repo.overview.mockResolvedValue({ collected: 45, total: 370 });
      expect(await service.overview('u1')).toEqual({ percent: 12, collected: 45, total: 370 });
    });
    it('returns percent 0 when total is 0', async () => {
      repo.overview.mockResolvedValue({ collected: 0, total: 0 });
      expect(await service.overview('u1')).toEqual({ percent: 0, collected: 0, total: 0 });
    });
  });

  describe('regions', () => {
    it('merges province names (sorted) with counts, 0-fills unvisited, locked=false', async () => {
      regionsSvc.listRegions.mockResolvedValue([
        { code: '8', name: '세종특별자치시' },
        { code: '39', name: '제주특별자치도' },
      ]);
      repo.regionTotals.mockResolvedValue(new Map([['8', 5], ['39', 40]]));
      repo.regionVisited.mockResolvedValue(new Map([['39', 2]])); // 세종 미방문
      const out = await service.regions('u1', 'KO');
      expect(regionsSvc.listRegions).toHaveBeenCalledWith('KO');
      expect(out).toEqual([
        { sidoCode: '8', name: '세종특별자치시', collected: 0, total: 5, percent: 0, locked: false, imageUrl: null },
        { sidoCode: '39', name: '제주특별자치도', collected: 2, total: 40, percent: 5, locked: false, imageUrl: null },
      ]);
    });

    it('uses resolveRegionImage per province for imageUrl', async () => {
      regionsSvc.listRegions.mockResolvedValue([{ code: '39', name: '제주특별자치도' }]);
      repo.regionTotals.mockResolvedValue(new Map([['39', 40]]));
      repo.regionVisited.mockResolvedValue(new Map([['39', 2]]));
      rep.resolveRegionImage.mockResolvedValue('/api/certifications/photos/certifications/region.png');
      const out = await service.regions('u1', 'KO');
      expect(rep.resolveRegionImage).toHaveBeenCalledWith('u1', '39');
      expect(out[0].imageUrl).toBe('/api/certifications/photos/certifications/region.png');
    });
  });

  describe('recent', () => {
    const d1 = new Date('2026-07-11T00:00:02.000Z');
    const d2 = new Date('2026-07-11T00:00:01.000Z');

    it('maps visits to items with resolver imageUrl (or null) and collectedAt, builds nextCursor', async () => {
      // limit 1 → repo returns limit+1=2 rows → hasNext true
      repo.recentVisitsPage.mockResolvedValue([
        { id: 'v1', createdAt: d1, placeId: 'p1' },
        { id: 'v2', createdAt: d2, placeId: 'p2' },
      ]);
      repo.placeNames.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '오름' },
      ]);
      rep.resolvePlaceImages.mockResolvedValue(
        new Map([['p1', '/api/certifications/photos/certifications/a.png']]),
      );
      const out = await service.recent('u1', 'KO', undefined, 1);
      expect(rep.resolvePlaceImages).toHaveBeenCalledWith('u1', ['p1']);
      expect(out.items).toEqual([
        {
          placeId: 'p1',
          name: '오름',
          imageUrl: '/api/certifications/photos/certifications/a.png',
          collectedAt: d1.toISOString(),
        },
      ]);
      expect(out.nextCursor).toEqual(expect.any(String));
      expect(repo.recentVisitsPage).toHaveBeenCalledWith('u1', 1, undefined);
    });

    it('imageUrl is null when resolver has no image; name falls back empty; last page has null cursor', async () => {
      repo.recentVisitsPage.mockResolvedValue([{ id: 'v9', createdAt: d1, placeId: 'p9' }]);
      repo.placeNames.mockResolvedValue([]); // 이름 없음 → ''
      rep.resolvePlaceImages.mockResolvedValue(new Map()); // 이미지 없음 → null
      const out = await service.recent('u1', 'KO', undefined, 20);
      expect(out.items).toEqual([
        { placeId: 'p9', name: '', imageUrl: null, collectedAt: d1.toISOString() },
      ]);
      expect(out.nextCursor).toBeNull();
    });
  });
});
