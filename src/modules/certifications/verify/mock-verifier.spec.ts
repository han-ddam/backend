import { MockVerifier } from './mock-verifier';

describe('MockVerifier', () => {
  it('always passes (MVP stub — real AI verifiers slot in later)', async () => {
    const v = new MockVerifier();
    const out = await v.verify({ id: 'c1', placeId: 'p1', imageKey: 'k' });
    expect(out).toEqual({ pass: true });
  });
});
