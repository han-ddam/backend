import { StatsService } from './stats.service';

describe('StatsService', () => {
  let repo: any, dogam: any, badges: any, service: StatsService;

  beforeEach(() => {
    repo = {
      rankPage: jest.fn(),
      myStats: jest.fn(),
      dogamPercentFor: jest.fn(),
      userBasic: jest.fn(),
    };
    dogam = { overview: jest.fn() };
    badges = {
      representativeFor: jest.fn().mockResolvedValue(new Map()),
      evaluate: jest.fn(),
    };
    service = new StatsService(repo, dogam, badges);
  });

  describe('profile', () => {
    it('assembles level + dogam + rank', async () => {
      repo.userBasic.mockResolvedValue({ handle: '@a', displayName: '에이' });
      repo.myStats.mockResolvedValue({ rank: 127, score: 2450, totalRankers: 15284, pointsToNext: 18 });
      dogam.overview.mockResolvedValue({ percent: 63, collected: 102, total: 370 });
      const out = await service.profile('u1');
      expect(repo.myStats).toHaveBeenCalledWith('u1', 'CUMULATIVE');
      expect(out).toEqual({
        handle: '@a', displayName: '에이', avatarUrl: null,
        level: 7, exp: 350, expForNextLevel: 700,
        dogamPercent: 63, visitedCount: 102,
        nationalRank: 127, totalUsers: 15284,
      });
      expect(badges.evaluate).toHaveBeenCalledWith('u1');
    });

    it('rank null when user has no score', async () => {
      repo.userBasic.mockResolvedValue({ handle: '@b', displayName: '비' });
      repo.myStats.mockResolvedValue({ rank: null, score: 0, totalRankers: 15284, pointsToNext: 0 });
      dogam.overview.mockResolvedValue({ percent: 0, collected: 0, total: 370 });
      const out = await service.profile('u2');
      expect(out.level).toBe(1);
      expect(out.exp).toBe(0);
      expect(out.nationalRank).toBeNull();
    });
  });

  describe('rankings', () => {
    it('builds top3, leaderboard (with dogam% + nextCursor), me, topPercent', async () => {
      // rankPage called twice: top3 (limit 3) and page (limit+1=3 for limit 2)
      repo.rankPage.mockImplementation(async (_p: string, limit: number) => {
        const all = [
          { rank: 1, userId: 'x', score: '980', handle: '@x' },
          { rank: 2, userId: 'y', score: '500', handle: '@y' },
          { rank: 3, userId: 'z', score: '320', handle: '@z' },
        ];
        return all.slice(0, limit);
      });
      repo.dogamPercentFor.mockResolvedValue(new Map([['x', 40], ['y', 22]]));
      repo.myStats.mockResolvedValue({ rank: 127, score: 315, totalRankers: 200, pointsToNext: 18 });
      dogam.overview.mockResolvedValue({ percent: 63, collected: 102, total: 370 });

      const out = await service.rankings('u1', 'NATIONAL', 'CUMULATIVE', undefined, 2, 'KO');
      // top3
      expect(out.top3).toEqual([
        { rank: 1, handle: '@x', score: 980, badge: null },
        { rank: 2, handle: '@y', score: 500, badge: null },
        { rank: 3, handle: '@z', score: 320, badge: null },
      ]);
      // leaderboard: limit 2 → fetched 3 → hasNext true, items 2, nextCursor set
      expect(out.leaderboard.items).toEqual([
        { rank: 1, handle: '@x', score: 980, dogamPercent: 40 },
        { rank: 2, handle: '@y', score: 500, dogamPercent: 22 },
      ]);
      expect(out.leaderboard.nextCursor).toEqual(expect.any(String));
      // me
      expect(out.me).toEqual({ rank: 127, score: 315, dogamPercent: 63, pointsToNext: 18 });
      // topPercent = round(127/200*100) = 64
      expect(out.topPercent).toBe(64);
      // badges.representativeFor called with top3 userIds + locale
      expect(badges.representativeFor).toHaveBeenCalledWith(['x', 'y', 'z'], 'KO');
    });

    it('maps top3 badge from badges.representativeFor result (null for users without one)', async () => {
      repo.rankPage.mockImplementation(async (_p: string, limit: number) => {
        const all = [
          { rank: 1, userId: 'x', score: '980', handle: '@x' },
          { rank: 2, userId: 'y', score: '500', handle: '@y' },
          { rank: 3, userId: 'z', score: '320', handle: '@z' },
        ];
        return all.slice(0, limit);
      });
      repo.dogamPercentFor.mockResolvedValue(new Map());
      repo.myStats.mockResolvedValue({ rank: 127, score: 315, totalRankers: 200, pointsToNext: 18 });
      dogam.overview.mockResolvedValue({ percent: 63, collected: 102, total: 370 });
      badges.representativeFor.mockResolvedValue(
        new Map([['x', { code: 'LEVEL_10', name: '여행마스터', iconKey: 'trophy' }]]),
      );

      const out = await service.rankings('u1', 'NATIONAL', 'CUMULATIVE', undefined, 2, 'KO');
      expect(out.top3).toEqual([
        { rank: 1, handle: '@x', score: 980, badge: { code: 'LEVEL_10', name: '여행마스터', iconKey: 'trophy' } },
        { rank: 2, handle: '@y', score: 500, badge: null },
        { rank: 3, handle: '@z', score: 320, badge: null },
      ]);
    });

    it('last page → nextCursor null; unranked me → topPercent null', async () => {
      repo.rankPage.mockImplementation(async (_p: string, limit: number) =>
        [{ rank: 1, userId: 'x', score: '980', handle: '@x' }].slice(0, limit),
      );
      repo.dogamPercentFor.mockResolvedValue(new Map([['x', 40]]));
      repo.myStats.mockResolvedValue({ rank: null, score: 0, totalRankers: 1, pointsToNext: 0 });
      dogam.overview.mockResolvedValue({ percent: 0, collected: 0, total: 370 });
      const out = await service.rankings('u9', 'NATIONAL', 'MONTHLY', undefined, 20, 'KO');
      expect(out.leaderboard.nextCursor).toBeNull();
      expect(out.me).toEqual({ rank: null, score: 0, dogamPercent: 0, pointsToNext: 0 });
      expect(out.topPercent).toBeNull();
    });

    it('malformed cursor is treated as first page (no throw, rankPage called with null cursor)', async () => {
      repo.rankPage.mockImplementation(async (_p: string, limit: number) =>
        [{ rank: 1, userId: 'x', score: '980', handle: '@x' }].slice(0, limit),
      );
      repo.dogamPercentFor.mockResolvedValue(new Map([['x', 40]]));
      repo.myStats.mockResolvedValue({ rank: 1, score: 980, totalRankers: 1, pointsToNext: 0 });
      dogam.overview.mockResolvedValue({ percent: 40, collected: 1, total: 370 });

      const malformedCursor = Buffer.from('abc|xyz').toString('base64url');

      await expect(
        service.rankings('u1', 'NATIONAL', 'CUMULATIVE', malformedCursor, 20, 'KO'),
      ).resolves.toBeDefined();

      // second rankPage call is the paged leaderboard call (first is top3 with limit 3, cursor null)
      expect(repo.rankPage).toHaveBeenCalledWith(expect.anything(), expect.any(Number), null);
      const pagedCall = repo.rankPage.mock.calls[1];
      expect(pagedCall[2]).toBeNull();
    });
  });

  describe('summaryStats', () => {
    it('maps myStats(CUMULATIVE) to {score, nationalRank, totalUsers}', async () => {
      repo.myStats.mockResolvedValue({ rank: 127, score: 315, totalRankers: 15284, pointsToNext: 18 });
      const out = await service.summaryStats('u1');
      expect(repo.myStats).toHaveBeenCalledWith('u1', 'CUMULATIVE');
      expect(out).toEqual({ score: 315, nationalRank: 127, totalUsers: 15284 });
    });
    it('nationalRank null when unranked', async () => {
      repo.myStats.mockResolvedValue({ rank: null, score: 0, totalRankers: 5, pointsToNext: 0 });
      const out = await service.summaryStats('u2');
      expect(out).toEqual({ score: 0, nationalRank: null, totalUsers: 5 });
    });
  });
});
