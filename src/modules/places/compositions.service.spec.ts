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
});
