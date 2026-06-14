import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';

function contextWith(headers: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('AdminKeyGuard', () => {
  const KEY = 'a-very-long-admin-secret-key';
  const config = { get: jest.fn().mockReturnValue(KEY) } as any;
  const guard = new AdminKeyGuard(config);

  it('allows a request with the correct admin key', () => {
    expect(guard.canActivate(contextWith({ 'x-admin-key': KEY }))).toBe(true);
  });

  it('rejects a missing key', () => {
    expect(() => guard.canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });

  it('rejects a wrong key', () => {
    expect(() => guard.canActivate(contextWith({ 'x-admin-key': 'nope' }))).toThrow(
      UnauthorizedException,
    );
  });
});
