import { NotFoundException } from '@nestjs/common';
import { VisitsService } from './visits.service';

describe('VisitsService', () => {
  let repo: any;
  let id: any;
  let badges: any;
  let service: VisitsService;

  beforeEach(() => {
    repo = { placeActive: jest.fn(), record: jest.fn() };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    badges = { evaluate: jest.fn() };
    service = new VisitsService(repo, id, badges);
  });

  it('records a new visit and returns VISITED with visitedAt', async () => {
    const when = new Date('2026-07-07T00:00:00.000Z');
    repo.placeActive.mockResolvedValue(true);
    repo.record.mockResolvedValue({ createdAt: when });
    const out = await service.record('u1', 'p1');
    expect(repo.record).toHaveBeenCalledWith('id-1', 'u1', 'p1');
    expect(out).toEqual({ placeId: 'p1', visitStatus: 'VISITED', visitedAt: when.toISOString() });
    expect(badges.evaluate).toHaveBeenCalledWith('u1');
  });

  it('is idempotent — returns existing row on duplicate', async () => {
    const when = new Date('2026-07-06T00:00:00.000Z');
    repo.placeActive.mockResolvedValue(true);
    repo.record.mockResolvedValue({ createdAt: when });
    const out = await service.record('u1', 'p1');
    expect(out.visitedAt).toBe(when.toISOString());
  });

  it('throws NotFound when place is missing or hidden', async () => {
    repo.placeActive.mockResolvedValue(false);
    await expect(service.record('u1', 'nope')).rejects.toThrow(NotFoundException);
    expect(repo.record).not.toHaveBeenCalled();
  });
});
