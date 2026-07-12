import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlacesService } from './places.service';

describe('PlacesService', () => {
  let repo: any;
  let id: any;
  let ratings: any;
  let service: PlacesService;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      transFor: jest.fn(),
      transForMany: jest.fn(),
      listByProvince: jest.fn(),
      listAll: jest.fn(),
      create: jest.fn(),
      nearestRegionCode: jest.fn(),
      nearbyPlaces: jest.fn(),
      setStatus: jest.fn(),
      hasVisit: jest.fn(),
    };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    ratings = { aggregateFor: jest.fn().mockResolvedValue({ average: null, count: 0, myScore: null }) };
    service = new PlacesService(repo, id, ratings);
  });

  describe('createPlace', () => {
    it('requires a KO translation', async () => {
      await expect(
        service.createPlace({
          regionCode: '1_1',
          basePoints: 0,
          rarityWeight: 1,
          translations: [{ locale: 'EN', name: 'x' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates with rarity as 2-decimal string', async () => {
      repo.create.mockResolvedValue({ id: 'p1' });
      await service.createPlace({
        regionCode: '1_1',
        basePoints: 15,
        rarityWeight: 1.5,
        translations: [{ locale: 'KO', name: '영금정' }],
      });
      const [input] = repo.create.mock.calls[0];
      expect(input.rarityWeight).toBe('1.50');
      expect(input.regionCode).toBe('1_1');
    });
  });

  describe('getPlace', () => {
    const place = {
      id: 'p1',
      regionCode: '1_1',
      status: 'ACTIVE',
      tags: ['t'],
      rarityWeight: '1.50',
      lat: 1,
      lng: 2,
    };

    it('throws when missing or hidden', async () => {
      repo.findById.mockResolvedValue(undefined);
      await expect(service.getPlace('p1', 'KO')).rejects.toThrow(NotFoundException);
    });

    it('falls back to KO when the locale row is missing', async () => {
      repo.findById.mockResolvedValue(place);
      repo.transFor.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: 'addr', description: null, mission: null },
      ]);
      const v = await service.getPlace('p1', 'EN');
      expect(v.name).toBe('영금정');
      expect(v.rarityWeight).toBe(1.5);
    });

    it('expands with imageUrl, rating placeholder, and VISITED when user visited', async () => {
      repo.findById.mockResolvedValue({
        id: 'p1', regionCode: '1_1', status: 'ACTIVE', tags: ['t'],
        rarityWeight: '1.50', imageUrl: 'http://tong/x.jpg', lat: 1, lng: 2,
      });
      repo.transFor.mockResolvedValue([{ locale: 'KO', name: '영금정', address: '속초', description: null, mission: null }]);
      repo.hasVisit.mockResolvedValue(true);

      const out = await service.getPlace('p1', 'KO', 'u1');

      expect(out.imageUrl).toBe('http://tong/x.jpg');
      expect(out.rating).toBeNull();
      expect(out.ratingCount).toBe(0);
      expect(out.myRating).toBeNull();
      expect(out.visitStatus).toBe('VISITED');
      expect(repo.hasVisit).toHaveBeenCalledWith('u1', 'p1');
    });

    it('guest gets NONE and never queries visits; null imageUrl passes through', async () => {
      repo.findById.mockResolvedValue({
        id: 'p1', regionCode: '1_1', status: 'ACTIVE', tags: [],
        rarityWeight: '1.00', imageUrl: null, lat: null, lng: null,
      });
      repo.transFor.mockResolvedValue([{ locale: 'KO', name: '영금정', address: null, description: null, mission: null }]);

      const out = await service.getPlace('p1', 'KO', null);

      expect(out.imageUrl).toBeNull();
      expect(out.visitStatus).toBe('NONE');
      expect(out.myRating).toBeNull();
      expect(repo.hasVisit).not.toHaveBeenCalled();
    });

    it('merges rating aggregate (average, count, myRating)', async () => {
      repo.findById.mockResolvedValue({
        id: 'p1', regionCode: '1_1', status: 'ACTIVE', tags: [],
        rarityWeight: '1.00', imageUrl: null, lat: null, lng: null,
      });
      repo.transFor.mockResolvedValue([{ locale: 'KO', name: '영금정', address: null, description: null, mission: null }]);
      repo.hasVisit.mockResolvedValue(false);
      ratings.aggregateFor.mockResolvedValue({ average: 4.8, count: 123, myScore: 4.5 });

      const out = await service.getPlace('p1', 'KO', 'u1');

      expect(ratings.aggregateFor).toHaveBeenCalledWith('p1', 'u1');
      expect(out.rating).toBe(4.8);
      expect(out.ratingCount).toBe(123);
      expect(out.myRating).toBe(4.5);
    });
  });

  describe('listByProvince', () => {
    it('maps items with locale name and exposes nextCursor', async () => {
      const now = new Date();
      repo.listByProvince.mockResolvedValue([{ id: 'p1', tags: ['t'], createdAt: now }]);
      repo.transForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: 'a' },
      ]);
      const r = await service.listByProvince({ province: '1', locale: 'KO', limit: 5 });
      expect(r.items[0].name).toBe('영금정');
      expect(r.nextCursor).toBeNull();
    });
  });

  describe('submitUserPlace', () => {
    it('inherits region from nearest place and creates PENDING_REVIEW', async () => {
      repo.nearestRegionCode.mockResolvedValue('1_13');
      repo.create.mockImplementation(async (p: any) => p);
      const out = await service.submitUserPlace('u1', {
        name: '우리동네 벚꽃길',
        address: '서울 성동구',
        lat: 37.547,
        lng: 127.04,
      });
      expect(repo.nearestRegionCode).toHaveBeenCalledWith(37.547, 127.04, 10000);
      expect(out).toEqual({
        placeId: expect.any(String),
        status: 'PENDING_REVIEW',
        regionCode: '1_13',
      });
      const created = repo.create.mock.calls[0][0];
      expect(created.status).toBe('PENDING_REVIEW');
      expect(created.createdBy).toBe('u1');
      expect(created.basePoints).toBe(0);
      expect(created.tourapiContentId).toBeNull();
    });

    it('passes KO translation with name/address/description', async () => {
      repo.nearestRegionCode.mockResolvedValue('39_4');
      repo.create.mockImplementation(async (p: any) => p);
      await service.submitUserPlace('u1', {
        name: '숨은 오름',
        lat: 33.4,
        lng: 126.5,
        description: '설명',
      });
      const trans = repo.create.mock.calls[0][1];
      expect(trans).toEqual([
        { locale: 'KO', name: '숨은 오름', address: undefined, description: '설명' },
      ]);
    });

    it('rejects coordinates with no place within 10km', async () => {
      repo.nearestRegionCode.mockResolvedValue(null);
      await expect(
        service.submitUserPlace('u1', { name: 'x', lat: 37.0, lng: 125.0 }),
      ).rejects.toThrow('지역을 판정할 수 없는 좌표입니다');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('does not call create when nearest lookup throws', async () => {
      repo.nearestRegionCode.mockRejectedValue(new Error('db down'));
      await expect(
        service.submitUserPlace('u1', { name: 'x', lat: 37.0, lng: 127.0 }),
      ).rejects.toThrow('db down');
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('setPlaceStatus', () => {
    it('updates status and returns id/status', async () => {
      repo.setStatus.mockResolvedValue({ id: 'p1', status: 'ACTIVE' });
      const out = await service.setPlaceStatus('p1', 'ACTIVE');
      expect(repo.setStatus).toHaveBeenCalledWith('p1', 'ACTIVE');
      expect(out).toEqual({ id: 'p1', status: 'ACTIVE' });
    });

    it('throws NotFound when place does not exist', async () => {
      repo.setStatus.mockResolvedValue(undefined);
      await expect(service.setPlaceStatus('nope', 'HIDDEN')).rejects.toThrow(
        'Place not found',
      );
    });
  });

  describe('nearby', () => {
    it('maps rows to items sorted by distance, rounds distanceM, thumbnailUrl null', async () => {
      repo.nearbyPlaces.mockResolvedValue([
        { id: 'p1', regionCode: '32_1', distanceM: 100.4 },
        { id: 'p2', regionCode: '32_1', distanceM: 1200.6 },
      ]);
      repo.transForMany.mockResolvedValue([
        { placeId: 'p1', locale: 'KO', name: '영금정', address: '속초시 A' },
        { placeId: 'p2', locale: 'KO', name: '설악산', address: null },
      ]);
      const out = await service.nearby({ lat: 38.2, lng: 128.6, locale: 'KO' });
      expect(repo.nearbyPlaces).toHaveBeenCalledWith(38.2, 128.6, 2000, 20); // 기본값
      expect(out).toEqual([
        { placeId: 'p1', name: '영금정', address: '속초시 A', distanceM: 100, regionCode: '32_1', thumbnailUrl: null },
        { placeId: 'p2', name: '설악산', address: null, distanceM: 1201, regionCode: '32_1', thumbnailUrl: null },
      ]);
    });

    it('passes explicit radius/limit and falls back name to empty string', async () => {
      repo.nearbyPlaces.mockResolvedValue([{ id: 'p3', regionCode: '39_4', distanceM: 5.2 }]);
      repo.transForMany.mockResolvedValue([]); // 이름 없음 → ''
      const out = await service.nearby({ lat: 33.4, lng: 126.5, radius: 500, limit: 5, locale: 'EN' });
      expect(repo.nearbyPlaces).toHaveBeenCalledWith(33.4, 126.5, 500, 5);
      expect(repo.transForMany).toHaveBeenCalledWith(['p3'], ['EN', 'KO']);
      expect(out).toEqual([
        { placeId: 'p3', name: '', address: null, distanceM: 5, regionCode: '39_4', thumbnailUrl: null },
      ]);
    });

    it('returns empty array when nothing is within radius', async () => {
      repo.nearbyPlaces.mockResolvedValue([]);
      const out = await service.nearby({ lat: 37, lng: 127, locale: 'KO' });
      expect(out).toEqual([]);
      expect(repo.transForMany).toHaveBeenCalledWith([], ['KO', 'KO']);
    });
  });
});
