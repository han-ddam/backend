import { NotFoundException } from '@nestjs/common';
import { CompositionsService } from './compositions.service';

describe('CompositionsService', () => {
  let repo: any, storage: any, id: any, service: CompositionsService;

  beforeEach(() => {
    repo = {
      placeActive: jest.fn(),
      listForPlace: jest.fn(),
      transForCompositions: jest.fn(),
      create: jest.fn(),
      deleteById: jest.fn(),
    };
    storage = { save: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `c-${++n}`) };
    service = new CompositionsService(repo, storage, id);
  });

  describe('forPlace', () => {
    it('maps compositions seq-ordered with locale title/desc + imageUrl, null when no image', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([
        { id: 'k1', seq: 1, source: 'CURATED', exampleImageKey: 'compositions/a.jpg' },
        { id: 'k2', seq: 2, source: 'CURATED', exampleImageKey: null },
      ]);
      repo.transForCompositions.mockResolvedValue([
        { compositionId: 'k1', locale: 'KO', title: '정자+바다', description: '함께' },
        { compositionId: 'k2', locale: 'KO', title: '정자+바위', description: null },
      ]);
      const out = await service.forPlace('p1', 'KO');
      expect(repo.transForCompositions).toHaveBeenCalledWith(['k1', 'k2'], ['KO', 'KO']);
      expect(out).toEqual([
        { seq: 1, title: '정자+바다', description: '함께', exampleImageUrl: '/api/places/compositions/photos/compositions/a.jpg', source: 'CURATED' },
        { seq: 2, title: '정자+바위', description: null, exampleImageUrl: null, source: 'CURATED' },
      ]);
    });

    it('title falls back to empty string when no translation', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([{ id: 'k9', seq: 1, source: 'AI', exampleImageKey: null }]);
      repo.transForCompositions.mockResolvedValue([]); // 번역 없음
      const out = await service.forPlace('p1', 'EN');
      expect(repo.transForCompositions).toHaveBeenCalledWith(['k9'], ['EN', 'KO']);
      expect(out).toEqual([{ seq: 1, title: '', description: null, exampleImageUrl: null, source: 'AI' }]);
    });

    it('throws NotFound when place is not ACTIVE', async () => {
      repo.placeActive.mockResolvedValue(false);
      await expect(service.forPlace('nope', 'KO')).rejects.toThrow(NotFoundException);
      expect(repo.listForPlace).not.toHaveBeenCalled();
    });

    it('returns empty array when place has no compositions', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([]);
      const out = await service.forPlace('p1', 'KO');
      expect(out).toEqual([]);
    });
  });

  describe('admin', () => {
    it('uploadPhoto stores under compositions folder', async () => {
      storage.save.mockResolvedValue({ key: 'compositions/a.jpg' });
      const out = await service.uploadPhoto(Buffer.from('x'), 'image/jpeg');
      expect(storage.save).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'compositions');
      expect(out).toEqual({ imageKey: 'compositions/a.jpg' });
    });

    it('adminCreate inserts composition + trans (default source CURATED)', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.create.mockResolvedValue(undefined);
      const out = await service.adminCreate('p1', {
        seq: 1,
        imageKey: 'compositions/a.jpg',
        translations: [{ locale: 'KO', title: '정자+바다', description: '함께' }],
      });
      expect(out).toEqual({ compositionId: 'c-1' });
      expect(repo.create).toHaveBeenCalledWith(
        { id: 'c-1', placeId: 'p1', seq: 1, source: 'CURATED', exampleImageKey: 'compositions/a.jpg' },
        [{ locale: 'KO', title: '정자+바다', description: '함께' }],
      );
    });

    it('adminCreate throws NotFound when place inactive', async () => {
      repo.placeActive.mockResolvedValue(false);
      await expect(
        service.adminCreate('nope', { seq: 1, translations: [{ locale: 'KO', title: 't' }] }),
      ).rejects.toThrow('Place not found');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('adminCreate throws BadRequest when KO translation missing', async () => {
      repo.placeActive.mockResolvedValue(true);
      await expect(
        service.adminCreate('p1', { seq: 1, translations: [{ locale: 'EN', title: 't' }] }),
      ).rejects.toThrow('KO translation is required');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('adminList assembles per-composition translations, imageUrl null when no key', async () => {
      repo.listForPlace.mockResolvedValue([
        { id: 'k1', seq: 1, source: 'CURATED', exampleImageKey: 'compositions/a.jpg' },
      ]);
      repo.transForCompositions.mockResolvedValue([
        { compositionId: 'k1', locale: 'KO', title: '정자', description: null },
        { compositionId: 'k1', locale: 'EN', title: 'Pavilion', description: 'x' },
      ]);
      const out = await service.adminList('p1');
      expect(repo.transForCompositions).toHaveBeenCalledWith(['k1'], ['KO', 'EN', 'JA', 'ZH']);
      expect(out).toEqual([
        {
          id: 'k1',
          seq: 1,
          source: 'CURATED',
          exampleImageUrl: '/api/places/compositions/photos/compositions/a.jpg',
          translations: [
            { locale: 'KO', title: '정자', description: null },
            { locale: 'EN', title: 'Pavilion', description: 'x' },
          ],
        },
      ]);
    });

    it('adminDelete throws NotFound when composition missing', async () => {
      repo.deleteById.mockResolvedValue(false);
      await expect(service.adminDelete('nope')).rejects.toThrow('Composition not found');
    });
  });
});
