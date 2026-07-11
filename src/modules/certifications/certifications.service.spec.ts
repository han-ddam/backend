import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificationsService } from './certifications.service';

describe('CertificationsService', () => {
  let repo: any, geo: any, storage: any, queue: any, id: any;
  let service: CertificationsService;

  beforeEach(() => {
    repo = {
      placeCoords: jest.fn(),
      findByUserImageKey: jest.fn(),
      createPending: jest.fn(),
      createRejected: jest.fn(),
      getResult: jest.fn(),
    };
    geo = { isWithin: jest.fn(), distanceMeters: jest.fn() };
    storage = { save: jest.fn(), exists: jest.fn() };
    queue = { add: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `cert-${++n}`) };
    const config = { get: () => 150 } as any; // PROXIMITY_TOLERANCE_M
    service = new CertificationsService(repo, geo, storage, queue, id, config);
  });

  const dto = {
    placeId: 'p1',
    imageKey: 'certifications/a.jpg',
    deviceLat: 33.4,
    deviceLng: 126.5,
    caption: 'x',
    visibility: 'PUBLIC' as const,
  };

  it('uploadPhoto stores the buffer and returns the key', async () => {
    storage.save.mockResolvedValue({ key: 'certifications/a.jpg' });
    const out = await service.uploadPhoto(Buffer.from('x'), 'image/jpeg');
    expect(out).toEqual({ imageKey: 'certifications/a.jpg' });
  });

  it('submit within range → PENDING and enqueues the cert', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue({ lat: 33.4001, lng: 126.5001 });
    storage.exists.mockResolvedValue(true);
    geo.isWithin.mockResolvedValue(true);
    geo.distanceMeters.mockResolvedValue(12.3);
    const out = await service.submit('u1', dto);
    expect(geo.isWithin).toHaveBeenCalledWith(
      { lng: 126.5, lat: 33.4 },
      { lng: 126.5001, lat: 33.4001 },
      150,
    );
    expect(repo.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cert-1', userId: 'u1', placeId: 'p1', distanceM: 12.3 }),
    );
    expect(queue.add).toHaveBeenCalledWith('verify', { certId: 'cert-1' });
    expect(out).toEqual({ certId: 'cert-1', status: 'PENDING', proximityPass: true });
  });

  it('submit out of range → REJECTED, no enqueue', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue({ lat: 40, lng: 130 });
    storage.exists.mockResolvedValue(true);
    geo.isWithin.mockResolvedValue(false);
    geo.distanceMeters.mockResolvedValue(999999);
    const out = await service.submit('u1', dto);
    expect(repo.createRejected).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cert-1', reason: 'OUT_OF_RANGE', distanceM: 999999 }),
    );
    expect(queue.add).not.toHaveBeenCalled();
    expect(out).toEqual({ certId: 'cert-1', status: 'REJECTED', proximityPass: false });
  });

  it('submit is idempotent — PENDING replay re-enqueues the stuck cert', async () => {
    repo.findByUserImageKey.mockResolvedValue({
      id: 'old',
      status: 'PENDING',
      proximityPass: true,
    });
    const out = await service.submit('u1', dto);
    expect(out).toEqual({ certId: 'old', status: 'PENDING', proximityPass: true });
    expect(repo.createPending).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith('verify', { certId: 'old' });
  });

  it('submit is idempotent — non-PENDING replay (e.g. REJECTED) does not re-enqueue', async () => {
    repo.findByUserImageKey.mockResolvedValue({
      id: 'old',
      status: 'REJECTED',
      proximityPass: false,
    });
    const out = await service.submit('u1', dto);
    expect(out).toEqual({ certId: 'old', status: 'REJECTED', proximityPass: false });
    expect(repo.createPending).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('submit throws NotFound when place missing/hidden/no-coords', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue(null);
    await expect(service.submit('u1', dto)).rejects.toThrow(NotFoundException);
  });

  it('submit throws BadRequest when imageKey not uploaded', async () => {
    repo.findByUserImageKey.mockResolvedValue(null);
    repo.placeCoords.mockResolvedValue({ lat: 33.4, lng: 126.5 });
    storage.exists.mockResolvedValue(false);
    await expect(service.submit('u1', dto)).rejects.toThrow(BadRequestException);
  });

  it('getCertification throws NotFound when not owned/missing', async () => {
    repo.getResult.mockResolvedValue(null);
    await expect(service.getCertification('u1', 'nope')).rejects.toThrow(NotFoundException);
  });
});
