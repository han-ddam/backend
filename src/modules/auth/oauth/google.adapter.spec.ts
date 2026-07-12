import { UnauthorizedException } from '@nestjs/common';
import { GoogleOAuthAdapter } from './google.adapter';

/** ConfigService 목 — GOOGLE_CLIENT_ID만 사용. */
const cfg = (clientId: string | undefined) =>
  ({ get: (k: string) => (k === 'GOOGLE_CLIENT_ID' ? clientId : undefined) }) as any;

const tokeninfo = (body: Record<string, unknown>, ok = true) =>
  jest.fn().mockResolvedValue({ ok, json: async () => body }) as any;

describe('GoogleOAuthAdapter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fail-closed: rejects and does not call fetch when GOOGLE_CLIENT_ID is unset', async () => {
    global.fetch = jest.fn() as any;
    const adapter = new GoogleOAuthAdapter(cfg(undefined));
    await expect(adapter.verify('t')).rejects.toThrow(UnauthorizedException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('maps profile when aud is in the allowlist', async () => {
    global.fetch = tokeninfo({ sub: '42', email: 'a@b.com', name: '길동', aud: 'web.id' });
    const adapter = new GoogleOAuthAdapter(cfg('web.id,ios.id'));
    const profile = await adapter.verify('idtoken');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/tokeninfo?id_token=idtoken',
    );
    expect(profile).toEqual({
      provider: 'GOOGLE',
      providerUserId: '42',
      displayName: '길동',
      email: 'a@b.com',
    });
  });

  it('accepts any id in a multi-value allowlist (ios.id matches)', async () => {
    global.fetch = tokeninfo({ sub: '1', aud: 'ios.id' });
    const adapter = new GoogleOAuthAdapter(cfg('web.id,ios.id'));
    const profile = await adapter.verify('t');
    expect(profile.providerUserId).toBe('1');
    expect(profile.displayName).toBe('구글사용자'); // name 없을 때 폴백
    expect(profile.email).toBeNull();
  });

  it('rejects when aud is not in the allowlist', async () => {
    global.fetch = tokeninfo({ sub: '1', aud: 'evil.id' });
    const adapter = new GoogleOAuthAdapter(cfg('web.id'));
    await expect(adapter.verify('t')).rejects.toThrow('Google token audience mismatch');
  });

  it('rejects a non-2xx tokeninfo response', async () => {
    global.fetch = tokeninfo({}, false);
    const adapter = new GoogleOAuthAdapter(cfg('web.id'));
    await expect(adapter.verify('t')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when tokeninfo has no sub', async () => {
    global.fetch = tokeninfo({ aud: 'web.id' });
    const adapter = new GoogleOAuthAdapter(cfg('web.id'));
    await expect(adapter.verify('t')).rejects.toThrow(UnauthorizedException);
  });
});
