import { CertificationsProcessor } from './certifications.processor';

describe('CertificationsProcessor', () => {
  let repo: any, verifier: any, scoring: any, badges: any;
  let proc: CertificationsProcessor;

  beforeEach(() => {
    repo = { findById: jest.fn(), reject: jest.fn(), applyAccrual: jest.fn() };
    verifier = { verify: jest.fn() };
    scoring = { preview: jest.fn() };
    badges = { evaluate: jest.fn() };
    proc = new CertificationsProcessor(repo, verifier, scoring, badges);
  });

  const job = (certId: string) => ({ data: { certId } }) as any;
  const pending = { id: 'c1', userId: 'u1', placeId: 'p1', imageKey: 'k', status: 'PENDING', scoredAt: null };

  it('verified first collection → applies accrual (visit + score_event)', async () => {
    repo.findById.mockResolvedValue(pending);
    verifier.verify.mockResolvedValue({ pass: true });
    scoring.preview.mockResolvedValue({
      action: 'CERT_PHOTO',
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1,
      eventMultiplier: 1,
      estimatedPoints: 22.5,
    });
    repo.applyAccrual.mockResolvedValue({ awarded: true, weightedScore: 22.5 });
    await proc.process(job('c1'));
    expect(scoring.preview).toHaveBeenCalledWith('p1');
    expect(repo.applyAccrual).toHaveBeenCalledWith({
      certId: 'c1',
      userId: 'u1',
      placeId: 'p1',
      preview: expect.objectContaining({ estimatedPoints: 22.5 }),
    });
    expect(repo.reject).not.toHaveBeenCalled();
    expect(badges.evaluate).toHaveBeenCalledWith('u1');
  });

  it('does not fail the job when badge evaluate throws (already-committed accrual)', async () => {
    repo.findById.mockResolvedValue(pending);
    verifier.verify.mockResolvedValue({ pass: true });
    scoring.preview.mockResolvedValue({
      action: 'CERT_PHOTO',
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1,
      eventMultiplier: 1,
      estimatedPoints: 22.5,
    });
    repo.applyAccrual.mockResolvedValue({ awarded: true, weightedScore: 22.5 });
    badges.evaluate.mockRejectedValue(new Error('transient'));
    await expect(proc.process(job('c1'))).resolves.toBeUndefined();
  });

  it('accrual not awarded (already collected) → does not evaluate badges', async () => {
    repo.findById.mockResolvedValue(pending);
    verifier.verify.mockResolvedValue({ pass: true });
    scoring.preview.mockResolvedValue({
      action: 'CERT_PHOTO',
      basePoints: 15,
      regionWeight: 1.5,
      rarityWeight: 1,
      eventMultiplier: 1,
      estimatedPoints: 22.5,
    });
    repo.applyAccrual.mockResolvedValue({ awarded: false, weightedScore: 0 });
    await proc.process(job('c1'));
    expect(badges.evaluate).not.toHaveBeenCalled();
  });

  it('verification fails → rejects with reason, no accrual', async () => {
    repo.findById.mockResolvedValue(pending);
    verifier.verify.mockResolvedValue({ pass: false, reason: 'NOT_LANDMARK' });
    await proc.process(job('c1'));
    expect(repo.reject).toHaveBeenCalledWith('c1', 'NOT_LANDMARK');
    expect(repo.applyAccrual).not.toHaveBeenCalled();
    expect(badges.evaluate).not.toHaveBeenCalled();
  });

  it('skips when cert missing or not PENDING or already scored (idempotent)', async () => {
    repo.findById.mockResolvedValue({ ...pending, status: 'ACCEPTED', scoredAt: new Date() });
    await proc.process(job('c1'));
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(repo.applyAccrual).not.toHaveBeenCalled();

    repo.findById.mockResolvedValue(null);
    await proc.process(job('c2'));
    expect(verifier.verify).not.toHaveBeenCalled();
  });
});
