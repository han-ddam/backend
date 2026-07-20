import { CompositionsProcessor } from './compositions.processor';

describe('CompositionsProcessor', () => {
  let repo: any, generator: any, p: CompositionsProcessor;
  beforeEach(() => {
    repo = {
      generatedAt: jest.fn(),
      hasCompositions: jest.fn(),
      placeGenInfo: jest.fn(),
      insertGenerated: jest.fn(),
      markGenerated: jest.fn(),
    };
    generator = { enabled: true, generate: jest.fn() };
    p = new CompositionsProcessor(repo, generator);
  });
  it('generates + inserts when empty/unattempted', async () => {
    repo.generatedAt.mockResolvedValue(null);
    repo.hasCompositions.mockResolvedValue(false);
    repo.placeGenInfo.mockResolvedValue({ name: '남산', regionName: '서울', description: null });
    generator.generate.mockResolvedValue({ items: [{ title: 't', description: 'd' }] });
    await p.process({ data: { placeId: 'p1' } } as any);
    expect(repo.insertGenerated).toHaveBeenCalledWith('p1', [{ title: 't', description: 'd' }]);
  });
  it('skips when already attempted', async () => {
    repo.generatedAt.mockResolvedValue(new Date());
    await p.process({ data: { placeId: 'p1' } } as any);
    expect(generator.generate).not.toHaveBeenCalled();
  });
  it('skips insert when a concurrent writer (e.g. CSV import) sets generatedAt during generate()', async () => {
    repo.generatedAt.mockResolvedValueOnce(null).mockResolvedValueOnce(new Date());
    repo.hasCompositions.mockResolvedValue(false);
    repo.placeGenInfo.mockResolvedValue({ name: '남산', regionName: '서울', description: null });
    generator.generate.mockResolvedValue({ items: [{ title: 't', description: 'd' }] });
    await p.process({ data: { placeId: 'p1' } } as any);
    expect(generator.generate).toHaveBeenCalled();
    expect(repo.insertGenerated).not.toHaveBeenCalled();
    expect(repo.markGenerated).not.toHaveBeenCalled();
  });
});
