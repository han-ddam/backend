import { GeminiGenerator } from './gemini.generator';

describe('GeminiGenerator', () => {
  const cfg = (key?: string) => ({ get: (k: string) => ({ GEMINI_API_KEY: key, GEMINI_MODEL: 'm', COMPOSITION_COUNT: 3 } as any)[k] });

  it('disabled when no key', () => {
    const g = new GeminiGenerator(cfg(undefined) as any);
    expect(g.enabled).toBe(false);
  });

  it('parses JSON compositions', async () => {
    const g = new GeminiGenerator(cfg('k') as any);
    // 내부 model 호출을 스텁: generateContent → { response: { text: () => '{"compositions":[...]}' } }
    (g as any).model = { generateContent: jest.fn().mockResolvedValue({ response: { text: () => '{"compositions":[{"title":"a","description":"b"}]}' } }) };
    const out = await g.generate({ placeName: '남산타워', regionName: '서울' });
    expect(out.items).toEqual([{ title: 'a', description: 'b' }]);
  });

  it('retries once on 429 then succeeds', async () => {
    const g = new GeminiGenerator(cfg('k') as any);
    const err: any = new Error('rate'); err.status = 429;
    const gen = jest.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ response: { text: () => '{"compositions":[{"title":"a","description":"b"}]}' } });
    (g as any).model = { generateContent: gen };
    (g as any).sleep = () => Promise.resolve(); // backoff 즉시
    const out = await g.generate({ placeName: 'x', regionName: 'y' });
    expect(gen).toHaveBeenCalledTimes(2);
    expect(out.items.length).toBe(1);
  });
});
