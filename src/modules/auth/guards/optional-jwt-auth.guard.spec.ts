import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

function ctxWith(header?: string) {
  const req: any = { headers: header ? { authorization: header } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    _req: req,
  } as any;
}

describe('OptionalJwtAuthGuard', () => {
  it('sets req.user for a valid token', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'u1' }) };
    const guard = new OptionalJwtAuthGuard(jwt as any);
    const ctx = ctxWith('Bearer good');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toEqual({ userId: 'u1' });
  });

  it('allows and leaves req.user undefined when no header', async () => {
    const jwt = { verifyAsync: jest.fn() };
    const guard = new OptionalJwtAuthGuard(jwt as any);
    const ctx = ctxWith(undefined);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toBeUndefined();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('allows (does NOT throw) when token is invalid', async () => {
    const jwt = { verifyAsync: jest.fn().mockRejectedValue(new Error('bad')) };
    const guard = new OptionalJwtAuthGuard(jwt as any);
    const ctx = ctxWith('Bearer bad');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._req.user).toBeUndefined();
  });
});
