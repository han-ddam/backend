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
      expect(repo.detailPlacesPage).toHaveBeenCalledWith('c1', 'u1', null, 2);
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
});
