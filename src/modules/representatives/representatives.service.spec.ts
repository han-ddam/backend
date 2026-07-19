import { BadRequestException } from '@nestjs/common';
import { RepresentativeService } from './representatives.service';

const PHOTO = (k: string) => `/api/certifications/photos/${k}`;

describe('RepresentativeService', () => {
  let repo: any, svc: RepresentativeService;
  beforeEach(() => {
    repo = {
      officialImages: jest.fn(), latestCoverByPlace: jest.fn(), placePins: jest.fn(),
      regionPin: jest.fn(), firstCoverInProvince: jest.fn(), officialRegionCover: jest.fn(),
      myPhotosForPlace: jest.fn(), myPhotosForProvince: jest.fn(), certImageOwner: jest.fn(),
      upsertPlacePin: jest.fn(), deletePlacePin: jest.fn(), upsertRegionPin: jest.fn(), deleteRegionPin: jest.fn(),
    };
    svc = new RepresentativeService(repo);
  });

  describe('resolvePlaceImages', () => {
    it('pin > latest cover > official > null', async () => {
      repo.officialImages.mockResolvedValue(new Map([['p1', 'http://off/1.jpg'], ['p2', 'http://off/2.jpg'], ['p3', null], ['p4', null]]));
      repo.latestCoverByPlace.mockResolvedValue(new Map([['p2', 'certifications/cover2.jpg'], ['p3', 'certifications/cover3.jpg']]));
      repo.placePins.mockResolvedValue(new Map([['p1', 'certifications/pin1.jpg']]));
      const m = await svc.resolvePlaceImages('u1', ['p1', 'p2', 'p3', 'p4']);
      expect(m.get('p1')).toBe(PHOTO('certifications/pin1.jpg')); // 핀 우선
      expect(m.get('p2')).toBe(PHOTO('certifications/cover2.jpg')); // 커버
      expect(m.get('p3')).toBe(PHOTO('certifications/cover3.jpg')); // 오피셜 없어도 커버
      expect(m.get('p4')).toBeNull(); // 아무것도 없음
    });
    it('anon → official only', async () => {
      repo.officialImages.mockResolvedValue(new Map([['p1', 'http://off/1.jpg'], ['p2', null]]));
      const m = await svc.resolvePlaceImages(null, ['p1', 'p2']);
      expect(m.get('p1')).toBe('http://off/1.jpg');
      expect(m.get('p2')).toBeNull();
      expect(repo.latestCoverByPlace).not.toHaveBeenCalled();
    });
  });

  describe('resolveRegionImage', () => {
    it('pin > first cover > official cover > null', async () => {
      repo.regionPin.mockResolvedValue('certifications/rpin.jpg');
      expect(await svc.resolveRegionImage('u1', '11')).toBe(PHOTO('certifications/rpin.jpg'));
      repo.regionPin.mockResolvedValue(null);
      repo.firstCoverInProvince.mockResolvedValue('certifications/first.jpg');
      expect(await svc.resolveRegionImage('u1', '11')).toBe(PHOTO('certifications/first.jpg'));
      repo.firstCoverInProvince.mockResolvedValue(null);
      repo.officialRegionCover.mockResolvedValue('http://off/cover.jpg');
      expect(await svc.resolveRegionImage('u1', '11')).toBe('http://off/cover.jpg');
    });
    it('anon → official cover only', async () => {
      repo.officialRegionCover.mockResolvedValue('http://off/cover.jpg');
      expect(await svc.resolveRegionImage(null, '11')).toBe('http://off/cover.jpg');
      expect(repo.regionPin).not.toHaveBeenCalled();
    });
  });

  describe('pinPlace', () => {
    it('rejects cert image not owned / wrong place', async () => {
      repo.certImageOwner.mockResolvedValue(null);
      await expect(svc.pinPlace('u1', 'p1', 'ci-x')).rejects.toBeInstanceOf(BadRequestException);
      repo.certImageOwner.mockResolvedValue({ placeId: 'pOTHER', provinceCode: '11' });
      await expect(svc.pinPlace('u1', 'p1', 'ci-x')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('upserts when owned + matching place', async () => {
      repo.certImageOwner.mockResolvedValue({ placeId: 'p1', provinceCode: '11' });
      await svc.pinPlace('u1', 'p1', 'ci-1');
      expect(repo.upsertPlacePin).toHaveBeenCalledWith('u1', 'p1', 'ci-1');
    });
  });
});
