import { NotFoundException } from '@nestjs/common';
import { CollectionsService } from './collections.service';

describe('CollectionsService', () => {
  let repo: any, dogam: any, id: any, service: CollectionsService;

  beforeEach(() => {
    repo = {
      getActiveCollection: jest.fn(),
      collectionTrans: jest.fn(),
      placeTransForMany: jest.fn(),
      detailPlacesPage: jest.fn(),
      collectionCounts: jest.fn(),
      themesPage: jest.fn(),
      themeProgress: jest.fn(),
      themeThumbnails: jest.fn(),
      regionThumbnails: jest.fn(),
      anyActiveTheme: jest.fn(),
      collectionExists: jest.fn(),
      placeActive: jest.fn(),
      create: jest.fn(),
      updateMeta: jest.fn(),
      deleteById: jest.fn(),
      addPlace: jest.fn(),
      removePlace: jest.fn(),
      adminListPage: jest.fn(),
    };
    dogam = { regions: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `id-${++n}`) };
    service = new CollectionsService(repo, dogam, id);
  });

  describe('getCollectionDetail', () => {
    it('404 when collection missing or HIDDEN', async () => {
      repo.getActiveCollection.mockResolvedValue(null);
      await expect(service.getCollectionDetail('c1', 'KO', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('maps places with imageUrl, visitStatus, counts; nextCursor from seq', async () => {
      repo.getActiveCollection.mockResolvedValue({ id: 'c1' });
      repo.collectionTrans.mockResolvedValue([
        { collectionId: 'c1', locale: 'KO', title: '동해 명소', description: '설명' },
      ]);
      repo.collectionCounts.mockResolvedValue({ all: 8, visited: 3 });
      repo.detailPlacesPage.mockResolvedValue([
        { placeId: 'p1', seq: 1, imageUrl: 'http://tong/p1.jpg', visited: true },
        { placeId: 'p2', seq: 2, imageUrl: null, visited: false },
      ]);
      repo.placeTransForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초' },
        { placeId: 'p2', locale: 'KO', name: '설악산', address: null },
      ]);

      const out = await service.getCollectionDetail('c1', 'KO', 'u1', undefined, 1);

      expect(out.title).toBe('동해 명소');
      expect(out.description).toBe('설명');
      expect(out.counts).toEqual({ all: 8, visited: 3 });
      expect(out.items).toEqual([
        { placeId: 'p1', name: '영금정', address: '속초', imageUrl: 'http://tong/p1.jpg', visitStatus: 'VISITED' },
      ]);
      expect(out.nextCursor).not.toBeNull();
      // fetch uses limit+1
      expect(repo.detailPlacesPage).toHaveBeenCalledWith('c1', 'u1', null, 1);
    });

    it('guest gets NONE visitStatus', async () => {
      repo.getActiveCollection.mockResolvedValue({ id: 'c1' });
      repo.collectionTrans.mockResolvedValue([{ collectionId: 'c1', locale: 'KO', title: 't', description: null }]);
      repo.collectionCounts.mockResolvedValue({ all: 1, visited: 0 });
      repo.detailPlacesPage.mockResolvedValue([{ placeId: 'p1', seq: 1, imageUrl: null, visited: false }]);
      repo.placeTransForMany.mockResolvedValue([{ placeId: 'p1', locale: 'KO', name: '영금정', address: null }]);

      const out = await service.getCollectionDetail('c1', 'KO', null, undefined, 20);
      expect(out.items[0].visitStatus).toBe('NONE');
    });
  });

  describe('listThemesWithProgress', () => {
    it('maps theme cards with progress + thumbnails; nextCursor from seq', async () => {
      repo.themesPage.mockResolvedValue([
        { id: 'c1', seq: 1 },
        { id: 'c2', seq: 2 },
      ]);
      repo.collectionTrans.mockResolvedValue([
        { collectionId: 'c1', locale: 'KO', title: '동해 명소', description: null },
        { collectionId: 'c2', locale: 'KO', title: '등대 순례', description: null },
      ]);
      repo.themeProgress.mockResolvedValue(
        new Map([
          ['c1', { filled: 3, total: 8 }],
          ['c2', { filled: 0, total: 5 }],
        ]),
      );
      repo.themeThumbnails.mockResolvedValue(new Map([['c1', ['http://tong/a.jpg']], ['c2', []]]));

      const out = await service.listThemesWithProgress('u1', 'KO', undefined, 1);

      expect(repo.themesPage).toHaveBeenCalledWith(null, 1);
      expect(out.items).toEqual([
        { collectionId: 'c1', title: '동해 명소', filled: 3, total: 8, thumbnails: ['http://tong/a.jpg'] },
      ]);
      expect(out.nextCursor).not.toBeNull();
    });

    it('empty themes → empty page', async () => {
      repo.themesPage.mockResolvedValue([]);
      const out = await service.listThemesWithProgress('u1', 'KO', undefined, 20);
      expect(out).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('listMyCollections', () => {
    const regionCards = [
      { sidoCode: '11', name: '서울', percent: 50, collected: 5, total: 10, locked: false },
      { sidoCode: '32', name: '강원', percent: 40, collected: 4, total: 10, locked: false },
    ];

    it('regions first then themes, with kind; page spans boundary', async () => {
      dogam.regions.mockResolvedValue(regionCards);
      repo.regionThumbnails.mockResolvedValue(new Map([['11', ['http://tong/s.jpg']], ['32', []]]));
      // limit 3: 2 regions + 1 theme
      repo.themesPage.mockResolvedValue([{ id: 'c1', seq: 1 }]); // remaining=1, +1 → returns ≤2; here 1 (no next)
      repo.collectionTrans.mockResolvedValue([{ collectionId: 'c1', locale: 'KO', title: '동해', description: null }]);
      repo.themeProgress.mockResolvedValue(new Map([['c1', { filled: 2, total: 6 }]]));
      repo.themeThumbnails.mockResolvedValue(new Map([['c1', []]]));

      const out = await service.listMyCollections('u1', 'KO', undefined, 3);

      expect(out.items).toEqual([
        { kind: 'REGION', id: '11', title: '서울', filled: 5, total: 10, thumbnails: ['http://tong/s.jpg'] },
        { kind: 'REGION', id: '32', title: '강원', filled: 4, total: 10, thumbnails: [] },
        { kind: 'THEME', id: 'c1', title: '동해', filled: 2, total: 6, thumbnails: [] },
      ]);
      expect(out.nextCursor).toBeNull();
    });

    it('page full on regions → nextCursor is region marker (more exist)', async () => {
      dogam.regions.mockResolvedValue(regionCards);
      repo.regionThumbnails.mockResolvedValue(new Map([['11', []]]));
      repo.anyActiveTheme.mockResolvedValue(true);

      const out = await service.listMyCollections('u1', 'KO', undefined, 1);

      expect(out.items).toEqual([
        { kind: 'REGION', id: '11', title: '서울', filled: 5, total: 10, thumbnails: [] },
      ]);
      expect(out.nextCursor).not.toBeNull(); // more regions remain
      expect(repo.themesPage).not.toHaveBeenCalled();
    });

    it('THEME cursor skips regions entirely', async () => {
      repo.themesPage.mockResolvedValue([{ id: 'c2', seq: 5 }]);
      repo.collectionTrans.mockResolvedValue([{ collectionId: 'c2', locale: 'KO', title: '등대', description: null }]);
      repo.themeProgress.mockResolvedValue(new Map([['c2', { filled: 1, total: 3 }]]));
      repo.themeThumbnails.mockResolvedValue(new Map([['c2', []]]));
      const { encodeMergedTheme } = await import('./collections.cursor');

      const out = await service.listMyCollections('u1', 'KO', encodeMergedTheme(4, 'c1'), 20);

      expect(dogam.regions).not.toHaveBeenCalled();
      expect(out.items).toEqual([{ kind: 'THEME', id: 'c2', title: '등대', filled: 1, total: 3, thumbnails: [] }]);
    });
  });

  describe('admin', () => {
    it('adminCreate requires KO translation', async () => {
      await expect(
        service.adminCreate({ seq: 1, translations: [{ locale: 'EN', title: 'x' }] }),
      ).rejects.toThrow('KO translation is required');
    });

    it('adminCreate inserts and returns generated id', async () => {
      repo.create.mockResolvedValue(undefined);
      const out = await service.adminCreate({
        seq: 2,
        status: 'ACTIVE',
        translations: [{ locale: 'KO', title: '동해 명소', description: '설명' }],
      });
      expect(out).toEqual({ collectionId: 'id-1' });
      const [input, trans] = repo.create.mock.calls[0];
      expect(input).toEqual({ id: 'id-1', seq: 2, status: 'ACTIVE' });
      expect(trans).toEqual([{ locale: 'KO', title: '동해 명소', description: '설명' }]);
    });

    it('adminUpdate 404 when missing', async () => {
      repo.updateMeta.mockResolvedValue(null);
      await expect(service.adminUpdate('c1', { seq: 3 })).rejects.toThrow('Collection not found');
    });

    it('adminDelete 404 when missing', async () => {
      repo.deleteById.mockResolvedValue(false);
      await expect(service.adminDelete('c1')).rejects.toThrow('Collection not found');
    });

    it('adminAddPlace 404 when collection missing', async () => {
      repo.collectionExists.mockResolvedValue(false);
      await expect(service.adminAddPlace('c1', 'p1', 1)).rejects.toThrow('Collection not found');
    });

    it('adminAddPlace 404 when place not ACTIVE', async () => {
      repo.collectionExists.mockResolvedValue(true);
      repo.placeActive.mockResolvedValue(false);
      await expect(service.adminAddPlace('c1', 'p1', 1)).rejects.toThrow('Place not found');
    });

    it('adminAddPlace upserts membership', async () => {
      repo.collectionExists.mockResolvedValue(true);
      repo.placeActive.mockResolvedValue(true);
      repo.addPlace.mockResolvedValue(undefined);
      await service.adminAddPlace('c1', 'p1', 5);
      expect(repo.addPlace).toHaveBeenCalledWith('c1', 'p1', 5);
    });

    it('adminRemovePlace 404 when membership missing', async () => {
      repo.removePlace.mockResolvedValue(false);
      await expect(service.adminRemovePlace('c1', 'p1')).rejects.toThrow('Membership not found');
    });
  });
});
