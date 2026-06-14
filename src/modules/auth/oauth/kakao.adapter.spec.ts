import { UnauthorizedException } from '@nestjs/common';
import { KakaoOAuthAdapter } from './kakao.adapter';

describe('KakaoOAuthAdapter', () => {
  const adapter = new KakaoOAuthAdapter();

  afterEach(() => jest.restoreAllMocks());

  it('maps the Kakao user-info response to an OAuth profile', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 123456,
        kakao_account: { email: 'a@b.com', profile: { nickname: '길동' } },
      }),
    }) as any;

    const profile = await adapter.verify('kakao-token');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://kapi.kakao.com/v2/user/me',
      { headers: { Authorization: 'Bearer kakao-token' } },
    );
    expect(profile).toEqual({
      provider: 'KAKAO',
      providerUserId: '123456',
      displayName: '길동',
      email: 'a@b.com',
    });
  });

  it('falls back to a default nickname when none is provided', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, kakao_account: {} }),
    }) as any;

    const profile = await adapter.verify('t');
    expect(profile.displayName).toBe('카카오사용자');
    expect(profile.email).toBeNull();
  });

  it('rejects an invalid token (non-2xx response)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    await expect(adapter.verify('bad')).rejects.toThrow(UnauthorizedException);
  });
});
