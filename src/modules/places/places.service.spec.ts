import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlacesService } from './places.service';

describe('PlacesService', () => {
  let repo: any;
  let id: any;
  let service: PlacesService;

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      transFor: jest.fn(),
      transForMany: jest.fn(),
      listByProvince: jest.fn(),
      listAll: jest.fn(),
      create: jest.fn(),
    };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    service = new PlacesService(repo, id);
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
});
