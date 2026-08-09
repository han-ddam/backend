import { NotFoundException } from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';

describe('BookmarksService', () => {
  let repo: any, service: BookmarksService;

  beforeEach(() => {
    repo = {
      placeActive: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
      countByUser: jest.fn().mockResolvedValue(0),
      listByUser: jest.fn(),
      transForMany: jest.fn(),
    };
    service = new BookmarksService(repo);
  });

  describe('add', () => {
    it('404 when place not ACTIVE', async () => {
      repo.placeActive.mockResolvedValue(false);
      await expect(service.add('u1', 'p1')).rejects.toThrow(NotFoundException);
      expect(repo.add).not.toHaveBeenCalled();
    });

    it('adds (idempotent) and returns bookmarked true', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.add.mockResolvedValue(undefined);
      repo.countByUser.mockResolvedValue(5);
      const out = await service.add('u1', 'p1');
      expect(repo.add).toHaveBeenCalledWith('u1', 'p1');
      expect(repo.countByUser).toHaveBeenCalledWith('u1');
      expect(out).toEqual({ placeId: 'p1', bookmarked: true, total: 5 });
    });
  });

  describe('remove', () => {
    it('removes (idempotent) and returns bookmarked false', async () => {
      repo.remove.mockResolvedValue(undefined);
      repo.countByUser.mockResolvedValue(4);
      const out = await service.remove('u1', 'p1');
      expect(repo.remove).toHaveBeenCalledWith('u1', 'p1');
      expect(repo.countByUser).toHaveBeenCalledWith('u1');
      expect(out).toEqual({ placeId: 'p1', bookmarked: false, total: 4 });
    });
  });

  describe('list', () => {
    const row = (id: string, over: Partial<any> = {}) => ({
      id,
      regionCode: '39_1',
      imageUrl: '/api/places/images/x.webp',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      visited: false,
      ...over,
    });

    it('maps rows to items with KO name fallback and PLANNED/VISITED status', async () => {
      repo.listByUser.mockResolvedValue([
        row('p1', { visited: true }),
        row('p2', { visited: false }),
      ]);
      repo.transForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '성산일출봉' },
        { placeId: 'p2', locale: 'EN', name: 'Hallasan' },
        { placeId: 'p2', locale: 'KO', name: '한라산' },
      ]);

      const out = await service.list({ userId: 'u1', locale: 'KO', limit: 20 });

      expect(repo.listByUser).toHaveBeenCalledWith({ userId: 'u1', cursor: undefined, limit: 20 });
      expect(out.items).toEqual([
        {
          id: 'p1',
          name: '성산일출봉',
          regionCode: '39_1',
          imageUrl: '/api/places/images/x.webp',
          visitStatus: 'VISITED',
          bookmarkedAt: '2026-07-20T00:00:00.000Z',
        },
        {
          id: 'p2',
          name: '한라산', // KO 폴백(요청 locale KO)
          regionCode: '39_1',
          imageUrl: '/api/places/images/x.webp',
          visitStatus: 'PLANNED',
          bookmarkedAt: '2026-07-20T00:00:00.000Z',
        },
      ]);
      expect(out.nextCursor).toBeNull();
    });

    it('prefers requested locale over KO', async () => {
      repo.listByUser.mockResolvedValue([row('p2')]);
      repo.transForMany.mockResolvedValue([
        { placeId: 'p2', locale: 'EN', name: 'Hallasan' },
        { placeId: 'p2', locale: 'KO', name: '한라산' },
      ]);
      const out = await service.list({ userId: 'u1', locale: 'EN', limit: 20 });
      expect(out.items[0].name).toBe('Hallasan');
    });

    it('name is empty string when no translation', async () => {
      repo.listByUser.mockResolvedValue([row('p3')]);
      repo.transForMany.mockResolvedValue([]);
      const out = await service.list({ userId: 'u1', locale: 'KO', limit: 20 });
      expect(out.items[0].name).toBe('');
    });

    it('sets nextCursor when repo returns limit+1 rows and trims to limit', async () => {
      repo.listByUser.mockResolvedValue([row('p1'), row('p2'), row('p3')]); // limit 2 → 3 rows
      repo.transForMany.mockResolvedValue([]);
      const out = await service.list({ userId: 'u1', locale: 'KO', limit: 2 });
      expect(out.items).toHaveLength(2);
      expect(out.nextCursor).not.toBeNull();
    });

    it('empty bookmarks → empty page', async () => {
      repo.listByUser.mockResolvedValue([]);
      repo.transForMany.mockResolvedValue([]);
      repo.countByUser.mockResolvedValue(0);
      const out = await service.list({ userId: 'u1', locale: 'KO', limit: 20 });
      expect(out).toEqual({ items: [], nextCursor: null, total: 0 });
    });

    it('clamps limit default to 20', async () => {
      repo.listByUser.mockResolvedValue([]);
      await service.list({ userId: 'u1', locale: 'KO' });
      expect(repo.listByUser).toHaveBeenCalledWith({ userId: 'u1', cursor: undefined, limit: 20 });
    });

    it('falls back to KO when requested locale has no translation', async () => {
      repo.listByUser.mockResolvedValue([row('p2')]);
      repo.transForMany.mockResolvedValue([{ placeId: 'p2', locale: 'KO', name: '한라산' }]);
      const out = await service.list({ userId: 'u1', locale: 'EN', limit: 20 });
      expect(out.items[0].name).toBe('한라산');
    });

    it('passes through null imageUrl', async () => {
      repo.listByUser.mockResolvedValue([row('p1', { imageUrl: null })]);
      repo.transForMany.mockResolvedValue([]);
      const out = await service.list({ userId: 'u1', locale: 'KO', limit: 20 });
      expect(out.items[0].imageUrl).toBeNull();
    });

    it('clamps limit to 1 when requested limit is 0 or negative', async () => {
      repo.listByUser.mockResolvedValue([]);
      await service.list({ userId: 'u1', locale: 'KO', limit: 0 });
      expect(repo.listByUser).toHaveBeenCalledWith({ userId: 'u1', cursor: undefined, limit: 1 });

      await service.list({ userId: 'u1', locale: 'KO', limit: -5 });
      expect(repo.listByUser).toHaveBeenCalledWith({ userId: 'u1', cursor: undefined, limit: 1 });
    });

    it('clamps limit to 100 when requested limit exceeds 100', async () => {
      repo.listByUser.mockResolvedValue([]);
      await service.list({ userId: 'u1', locale: 'KO', limit: 500 });
      expect(repo.listByUser).toHaveBeenCalledWith({ userId: 'u1', cursor: undefined, limit: 100 });
    });
  });
});

describe('BookmarksService total (내 찜 개수)', () => {
  const baseRepo = () => ({
    placeActive: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    countByUser: jest.fn().mockResolvedValue(7),
    listByUser: jest.fn().mockResolvedValue([]),
    transForMany: jest.fn().mockResolvedValue([]),
  });

  it('add returns bookmarked:true with my total', async () => {
    const repo = baseRepo();
    const res = await new BookmarksService(repo as any).add('u1', 'p1');
    expect(res).toEqual({ placeId: 'p1', bookmarked: true, total: 7 });
    expect(repo.countByUser).toHaveBeenCalledWith('u1');
  });

  it('add 404s when place inactive (no count)', async () => {
    const repo = baseRepo();
    repo.placeActive.mockResolvedValue(false);
    await expect(new BookmarksService(repo as any).add('u1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.countByUser).not.toHaveBeenCalled();
  });

  it('remove returns bookmarked:false with my total', async () => {
    const repo = baseRepo();
    repo.countByUser.mockResolvedValue(6);
    const res = await new BookmarksService(repo as any).remove('u1', 'p1');
    expect(res).toEqual({ placeId: 'p1', bookmarked: false, total: 6 });
    expect(repo.countByUser).toHaveBeenCalledWith('u1');
  });

  it('list includes my total alongside items/nextCursor', async () => {
    const repo = baseRepo();
    repo.countByUser.mockResolvedValue(3);
    const res = await new BookmarksService(repo as any).list({ userId: 'u1', locale: 'KO', limit: 20 });
    expect(res.total).toBe(3);
    expect(res).toHaveProperty('items');
    expect(res).toHaveProperty('nextCursor');
    expect(repo.countByUser).toHaveBeenCalledWith('u1');
  });
});
