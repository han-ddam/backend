import { DogamService } from './dogam.service';

describe('DogamService', () => {
  let repo: any, regionsSvc: any, service: DogamService;

  beforeEach(() => {
    repo = {
      overview: jest.fn(),
      regionTotals: jest.fn(),
      regionVisited: jest.fn(),
    };
    regionsSvc = { listRegions: jest.fn() };
    service = new DogamService(repo, regionsSvc);
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
        { sidoCode: '8', name: '세종특별자치시', collected: 0, total: 5, percent: 0, locked: false },
        { sidoCode: '39', name: '제주특별자치도', collected: 2, total: 40, percent: 5, locked: false },
      ]);
    });
  });
});
