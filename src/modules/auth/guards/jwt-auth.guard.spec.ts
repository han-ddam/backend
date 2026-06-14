import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWith(headers: Record<string, string>, req: any = {}) {
  req.headers = headers;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let jwt: any;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    guard = new JwtAuthGuard(jwt);
  });

  it('rejects when the Authorization header is missing', async () => {
    await expect(guard.canActivate(contextWith({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a non-bearer header', async () => {
    await expect(
      guard.canActivate(contextWith({ authorization: 'Basic abc' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches req.user for a valid token', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', role: 'ADMIN' });
    const req: any = {};

    const ok = await guard.canActivate(
      contextWith({ authorization: 'Bearer good.jwt' }, req),
    );

    expect(ok).toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good.jwt');
    expect(req.user).toEqual({ userId: 'u1', role: 'ADMIN' });
  });

  it('rejects an invalid token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad'));
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer bad.jwt' })),
    ).rejects.toThrow(UnauthorizedException);
  });
});
