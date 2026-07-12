import { HomeService } from './home.service';

describe('HomeService', () => {
  let repo: any, stats: any, dogam: any, service: HomeService;

  beforeEach(() => {
    repo = { discoveryToday: jest.fn(), placeNames: jest.fn() };
    stats = { summaryStats: jest.fn() };
    dogam = { overview: jest.fn(), regions: jest.fn() };
    service = new HomeService(repo, stats, dogam);
  });

  describe('summary', () => {
    it('combines stats + dogam overview', async () => {
      stats.summaryStats.mockResolvedValue({ score: 315, nationalRank: 127, totalUsers: 15284 });
      dogam.overview.mockResolvedValue({ percent: 63, collected: 102, total: 161 });
      const out = await service.summary('u1');
      expect(out).toEqual({
        score: 315, nationalRank: 127, totalUsers: 15284,
        progress: { percent: 63, collected: 102, total: 161 },
      });
    });
  });

  describe('progressSido', () => {
    it('drops the locked field from dogam.regions cards', async () => {
      dogam.regions.mockResolvedValue([
        { sidoCode: '1', name: '서울', percent: 80, collected: 8, total: 10, locked: false },
        { sidoCode: '39', name: '제주', percent: 5, collected: 2, total: 40, locked: false },
      ]);
      const out = await service.progressSido('u1', 'KO');
      expect(dogam.regions).toHaveBeenCalledWith('u1', 'KO');
      expect(out).toEqual([
        { sidoCode: '1', name: '서울', percent: 80, collected: 8, total: 10 },
        { sidoCode: '39', name: '제주', percent: 5, collected: 2, total: 40 },
      ]);
    });
  });

  describe('discoveryToday', () => {
    it('maps places with name/address (locale/KO), imageUrl null, default limit 3', async () => {
      repo.discoveryToday.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      repo.placeNames.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초 A' },
        { placeId: 'p2', locale: 'KO', name: '설악산', address: null },
      ]);
      const out = await service.discoveryToday('u1', 'KO');
      expect(repo.discoveryToday).toHaveBeenCalledWith('u1', 3);
      expect(repo.placeNames).toHaveBeenCalledWith(['p1', 'p2'], ['KO', 'KO']);
      expect(out).toEqual([
        { placeId: 'p1', name: '영금정', address: '속초 A', imageUrl: null },
        { placeId: 'p2', name: '설악산', address: null, imageUrl: null },
      ]);
    });

    it('name falls back to empty when no translation; clamps limit; empty ok', async () => {
      repo.discoveryToday.mockResolvedValue([{ id: 'p9' }]);
      repo.placeNames.mockResolvedValue([]); // 번역 없음 → name ''
      const out = await service.discoveryToday('u1', 'EN', 50); // clamp → 20
      expect(repo.discoveryToday).toHaveBeenCalledWith('u1', 20);
      expect(repo.placeNames).toHaveBeenCalledWith(['p9'], ['EN', 'KO']);
      expect(out).toEqual([{ placeId: 'p9', name: '', address: null, imageUrl: null }]);
    });
  });
});
