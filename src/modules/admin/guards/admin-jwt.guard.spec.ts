import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminJwtGuard } from './admin-jwt.guard';

function contextWith(headers: Record<string, string>, req: any = {}) {
  req.headers = headers;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('AdminJwtGuard', () => {
  let jwt: any;
  let guard: AdminJwtGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    guard = new AdminJwtGuard(jwt);
  });

  it('attaches req.admin for a valid admin token', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'a1', role: 'ADMIN', typ: 'admin' });
    const req: any = {};

    const ok = await guard.canActivate(
      contextWith({ authorization: 'Bearer good' }, req),
    );

    expect(ok).toBe(true);
    expect(req.admin).toEqual({ adminId: 'a1', role: 'ADMIN' });
  });

  it('rejects a member token (no typ=admin)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer member' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a missing bearer header', async () => {
    await expect(guard.canActivate(contextWith({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
