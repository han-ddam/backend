import { NotFoundException } from '@nestjs/common';
import { CertificationsService } from './certifications.service';

describe('CertificationsService', () => {
  let repo: any, geo: any, storage: any, queue: any, id: any, scoring: any, badges: any;
  let service: CertificationsService;

  beforeEach(() => {
    repo = {
      placeCoords: jest.fn(),
      findCertByImageKey: jest.fn(),
      createPending: jest.fn(),
      createPendingGuarded: jest.fn().mockResolvedValue('CREATED'),
      createRejected: jest.fn(),
      getResult: jest.fn(),
      publicFeedForPlace: jest.fn(),
      applyAccrual: jest.fn(),
      recentCertExists: jest.fn(),
    };
    geo = { isWithin: jest.fn(), distanceMeters: jest.fn() };
    storage = { save: jest.fn(), exists: jest.fn() };
    queue = { add: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `cert-${++n}`) };
    scoring = { preview: jest.fn() };
    badges = { evaluate: jest.fn() };
    const config = { get: () => 150 } as any; // PROXIMITY_TOLERANCE_M
    service = new CertificationsService(repo, geo, storage, queue, id, config, scoring, badges);
  });

  it('uploadPhoto stores the buffer and returns the key', async () => {
    storage.save.mockResolvedValue({ key: 'certifications/a.jpg' });
    const out = await service.uploadPhoto(Buffer.from('x'), 'image/jpeg');
    expect(out).toEqual({ imageKey: 'certifications/a.jpg' });
  });

  describe('submit', () => {
    it('submit: N images with representativeIndex → createPending with images[]', async () => {
      repo.findCertByImageKey.mockResolvedValue(null);
      repo.placeCoords.mockResolvedValue({ lat: 37.5, lng: 127.0 });
      repo.recentCertExists.mockResolvedValue(false);
      storage.exists.mockResolvedValue(true);
      geo.distanceMeters.mockResolvedValue(10);
      geo.isWithin.mockResolvedValue(true);
      id.generate.mockReturnValue('cert-1');
      const out = await service.submit('u1', {
        placeId: 'p1', imageKeys: ['certifications/a.jpg', 'certifications/b.jpg'],
        representativeIndex: 1, deviceLat: 37.5, deviceLng: 127.0, visibility: 'PUBLIC',
      } as any);
      expect(out).toEqual({ certId: 'cert-1', status: 'PENDING', proximityPass: true });
      expect(repo.createPendingGuarded).toHaveBeenCalledWith(expect.objectContaining({
        id: 'cert-1', userId: 'u1', placeId: 'p1', visibility: 'PUBLIC',
        images: [
          { imageKey: 'certifications/a.jpg', seq: 0, isRepresentative: false },
          { imageKey: 'certifications/b.jpg', seq: 1, isRepresentative: true },
        ],
      }), 7);
      expect(queue.add).toHaveBeenCalledWith('verify', { certId: 'cert-1' });
    });

    it('submit: out of range → createRejected, no queue', async () => {
      repo.findCertByImageKey.mockResolvedValue(null);
      repo.placeCoords.mockResolvedValue({ lat: 37.5, lng: 127.0 });
      repo.recentCertExists.mockResolvedValue(false);
      storage.exists.mockResolvedValue(true);
      geo.distanceMeters.mockResolvedValue(9999);
      geo.isWithin.mockResolvedValue(false);
      id.generate.mockReturnValue('cert-2');
      const out = await service.submit('u1', {
        placeId: 'p1', imageKeys: ['certifications/a.jpg'], representativeIndex: 0,
        deviceLat: 37.5, deviceLng: 127.0, visibility: 'PRIVATE',
      } as any);
      expect(out).toEqual({ certId: 'cert-2', status: 'REJECTED', proximityPass: false });
      expect(repo.createRejected).toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('submit: idempotent — first imageKey already used by me → returns existing', async () => {
      repo.findCertByImageKey.mockResolvedValue({ id: 'cert-x', userId: 'u1', status: 'PENDING', proximityPass: true });
      const out = await service.submit('u1', {
        placeId: 'p1', imageKeys: ['certifications/a.jpg'], representativeIndex: 0,
        deviceLat: 37.5, deviceLng: 127.0, visibility: 'PUBLIC',
      } as any);
      expect(out).toEqual({ certId: 'cert-x', status: 'PENDING', proximityPass: true });
      expect(repo.createPending).not.toHaveBeenCalled();
    });

    it('submit: first imageKey used by ANOTHER user → 400', async () => {
      repo.findCertByImageKey.mockResolvedValue({ id: 'cert-y', userId: 'other', status: 'ACCEPTED', proximityPass: true });
      await expect(service.submit('u1', {
        placeId: 'p1', imageKeys: ['certifications/a.jpg'], representativeIndex: 0,
        deviceLat: 37.5, deviceLng: 127.0, visibility: 'PUBLIC',
      } as any)).rejects.toThrow('imageKey already used');
      expect(repo.createPending).not.toHaveBeenCalled();
    });

    it('submit: rejects re-cert within 7 days (409)', async () => {
      repo.findCertByImageKey.mockResolvedValue(null);
      repo.placeCoords.mockResolvedValue({ lat: 37.5, lng: 127.0 });
      repo.recentCertExists.mockResolvedValue(true);
      await expect(service.submit('u1', { placeId: 'p1', imageKeys: [], deviceLat: 37.5, deviceLng: 127.0, visibility: 'PUBLIC' } as any))
        .rejects.toThrow('7일');
      expect(repo.recentCertExists).toHaveBeenCalledWith('u1', 'p1', 7);
      expect(repo.createPendingGuarded).not.toHaveBeenCalled();
    });

    it('submit: guarded create returns COOLDOWN → 409 (concurrent race backstop)', async () => {
      repo.findCertByImageKey.mockResolvedValue(null);
      repo.placeCoords.mockResolvedValue({ lat: 37.5, lng: 127.0 });
      repo.recentCertExists.mockResolvedValue(false);
      geo.isWithin.mockResolvedValue(true); geo.distanceMeters.mockResolvedValue(10);
      id.generate.mockReturnValue('cert-c');
      repo.createPendingGuarded.mockResolvedValue('COOLDOWN');
      await expect(service.submit('u1', { placeId: 'p1', imageKeys: [], deviceLat: 37.5, deviceLng: 127.0, visibility: 'PUBLIC' } as any))
        .rejects.toThrow('7일');
      expect(repo.applyAccrual).not.toHaveBeenCalled();
    });

    it('submit: 0 images → VISIT, immediate ACCEPTED + accrual, no queue', async () => {
      repo.placeCoords.mockResolvedValue({ lat: 37.5, lng: 127.0 });
      repo.recentCertExists.mockResolvedValue(false);
      geo.distanceMeters.mockResolvedValue(10);
      geo.isWithin.mockResolvedValue(true);
      id.generate.mockReturnValue('cert-v');
      scoring.preview.mockResolvedValue({ action: 'CERT_PHOTO', basePoints: 10, typeWeight: 1, regionWeight: 1, rarityWeight: 1, eventMultiplier: 1, estimatedPoints: 10 });
      repo.applyAccrual.mockResolvedValue({ awarded: true, weightedScore: 10 });
      const out = await service.submit('u1', { placeId: 'p1', imageKeys: [], deviceLat: 37.5, deviceLng: 127.0, visibility: 'PUBLIC' } as any);
      expect(out).toEqual({ certId: 'cert-v', status: 'ACCEPTED', proximityPass: true });
      expect(repo.createPendingGuarded).toHaveBeenCalledWith(expect.objectContaining({ images: [] }), 7);
      expect(repo.applyAccrual).toHaveBeenCalledWith(expect.objectContaining({ certId: 'cert-v', type: 'VISIT' }));
      expect(queue.add).not.toHaveBeenCalled();
      expect(badges.evaluate).toHaveBeenCalledWith('u1');
    });
  });

  it('getCertification throws NotFound when not owned/missing', async () => {
    repo.getResult.mockResolvedValue(null);
    await expect(service.getCertification('u1', 'nope')).rejects.toThrow(NotFoundException);
  });

  describe('publicFeedForPlace', () => {
    it('maps rows to images[]/coverImageUrl + handle and builds nextCursor', async () => {
      const rows = [
        {
          id: 'c2',
          createdAt: new Date('2026-07-07T00:00:00Z'),
          handle: '@b',
          images: [
            { imageKey: 'certifications/b0.jpg', isRepresentative: false },
            { imageKey: 'certifications/b1.jpg', isRepresentative: true },
          ],
        },
        {
          id: 'c1',
          createdAt: new Date('2026-07-06T00:00:00Z'),
          handle: '@a',
          images: [{ imageKey: 'certifications/a.jpg', isRepresentative: true }],
        },
      ];
      repo.publicFeedForPlace.mockResolvedValue(rows);
      const out = await service.publicFeedForPlace('p1', undefined, 1);
      expect(repo.publicFeedForPlace).toHaveBeenCalledWith('p1', undefined, 1);
      expect(out.items).toEqual([
        {
          images: [
            { imageUrl: '/api/certifications/photos/certifications/b0.jpg', isRepresentative: false },
            { imageUrl: '/api/certifications/photos/certifications/b1.jpg', isRepresentative: true },
          ],
          coverImageUrl: '/api/certifications/photos/certifications/b1.jpg',
          userHandle: '@b',
          createdAt: rows[0].createdAt,
        },
      ]);
      expect(out.nextCursor).not.toBeNull();
    });

    it('returns empty page with null cursor when no certs', async () => {
      repo.publicFeedForPlace.mockResolvedValue([]);
      const out = await service.publicFeedForPlace('p1', undefined, 8);
      expect(out).toEqual({ items: [], nextCursor: null });
    });
  });
});
