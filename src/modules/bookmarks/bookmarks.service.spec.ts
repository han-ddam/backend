import { NotFoundException } from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';

describe('BookmarksService', () => {
  let repo: any, service: BookmarksService;

  beforeEach(() => {
    repo = { placeActive: jest.fn(), add: jest.fn(), remove: jest.fn() };
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
      const out = await service.add('u1', 'p1');
      expect(repo.add).toHaveBeenCalledWith('u1', 'p1');
      expect(out).toEqual({ placeId: 'p1', bookmarked: true });
    });
  });

  describe('remove', () => {
    it('removes (idempotent) and returns bookmarked false', async () => {
      repo.remove.mockResolvedValue(undefined);
      const out = await service.remove('u1', 'p1');
      expect(repo.remove).toHaveBeenCalledWith('u1', 'p1');
      expect(out).toEqual({ placeId: 'p1', bookmarked: false });
    });
  });
});
