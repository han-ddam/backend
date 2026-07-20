import { NotFoundException } from '@nestjs/common';
import { CompositionsService } from './compositions.service';

describe('CompositionsService', () => {
  let repo: any, storage: any, id: any, queue: any, generator: any, service: CompositionsService;

  beforeEach(() => {
    repo = {
      placeActive: jest.fn(),
      listForPlace: jest.fn(),
      transForCompositions: jest.fn(),
      create: jest.fn(),
      deleteById: jest.fn(),
      generatedAt: jest.fn(),
      resolvePlaceByRegionName: jest.fn(),
      replaceForPlace: jest.fn(),
    };
    storage = { save: jest.fn() };
    let n = 0;
    id = { generate: jest.fn(() => `c-${++n}`) };
    queue = { add: jest.fn() };
    generator = { enabled: false };
    service = new CompositionsService(repo, storage, id, queue, generator);
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

    it('forPlace: empty + not-generated + enabled → enqueue', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([]);
      repo.transForCompositions.mockResolvedValue([]);
      repo.generatedAt.mockResolvedValue(null);
      generator.enabled = true;
      const out = await service.forPlace('p1', 'KO');
      expect(out).toEqual([]);
      expect(queue.add).toHaveBeenCalledWith(
        'gen',
        { placeId: 'p1' },
        expect.objectContaining({ jobId: 'p1', removeOnFail: true }),
      );
    });

    it('forPlace: queue.add rejects → does not throw, still returns rows', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([]);
      repo.transForCompositions.mockResolvedValue([]);
      repo.generatedAt.mockResolvedValue(null);
      generator.enabled = true;
      queue.add.mockRejectedValue(new Error('redis'));
      const out = await service.forPlace('p1', 'KO');
      expect(out).toEqual([]);
    });

    it('forPlace: has compositions → no enqueue', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([{ id: 'c1', seq: 0, source: 'AI', exampleImageKey: null }]);
      repo.transForCompositions.mockResolvedValue([{ compositionId: 'c1', locale: 'KO', title: 't', description: 'd' }]);
      generator.enabled = true;
      repo.generatedAt.mockResolvedValue(null);
      const out = await service.forPlace('p1', 'KO');
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('forPlace: generator disabled → no enqueue', async () => {
      repo.placeActive.mockResolvedValue(true);
      repo.listForPlace.mockResolvedValue([]);
      repo.transForCompositions.mockResolvedValue([]);
      generator.enabled = false;
      await service.forPlace('p1', 'KO');
      expect(queue.add).not.toHaveBeenCalled();
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

  describe('importCsv', () => {
    const csv = (s: string) => Buffer.from(s, 'utf-8');
    it('resolves + replaces per place, reports skips', async () => {
      repo.resolvePlaceByRegionName.mockImplementation(async (rc: string, n: string) => (n === '남산' ? 'p1' : null));
      const out = await service.importCsv(csv(
        'region_code,place_name,seq,title,description\n' +
        '11110,남산,0,t1,d1\n' +
        '11110,남산,1,t2,d2\n' +
        '99999,없는곳,0,x,y\n',
      ));
      expect(repo.replaceForPlace).toHaveBeenCalledWith('p1', [
        { seq: 0, title: 't1', description: 'd1' },
        { seq: 1, title: 't2', description: 'd2' },
      ], 'CURATED');
      expect(out.placesUpdated).toBe(1);
      expect(out.imported).toBe(2);
      expect(out.skipped).toEqual([{ line: 4, reason: 'place not found: 99999/없는곳' }]);
    });
  });
});
