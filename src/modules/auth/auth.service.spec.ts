import { AuthService } from './auth.service';

describe('AuthService', () => {
  let users: any;
  let tokens: any;
  let kakao: any;
  let naver: any;
  let google: any;
  let service: AuthService;

  const user = { id: 'u1' };
  const publicProfile = { id: 'u1', handle: 'user_x', displayName: '길동' };
  const tokenPair = { accessToken: 'a', refreshToken: 'r' };

  beforeEach(() => {
    users = {
      provisionFromOAuth: jest.fn().mockResolvedValue(user),
      toPublicProfile: jest.fn().mockReturnValue(publicProfile),
      getById: jest.fn().mockResolvedValue(user),
    };
    tokens = {
      issueTokens: jest.fn().mockResolvedValue(tokenPair),
      consumeRefreshToken: jest.fn().mockResolvedValue('u1'),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    kakao = { verify: jest.fn() };
    naver = { verify: jest.fn() };
    google = { verify: jest.fn() };
    service = new AuthService(users, tokens, kakao, naver, google);
  });

  describe('loginWithOAuth', () => {
    it('uses the Kakao verifier, provisions the user, and issues tokens', async () => {
      const profile = { provider: 'KAKAO', providerUserId: '123', displayName: '길동' };
      kakao.verify.mockResolvedValue(profile);

      const result = await service.loginWithOAuth('KAKAO', 'kakao-token');

      expect(kakao.verify).toHaveBeenCalledWith('kakao-token');
      expect(naver.verify).not.toHaveBeenCalled();
      expect(users.provisionFromOAuth).toHaveBeenCalledWith(profile);
      expect(tokens.issueTokens).toHaveBeenCalledWith(user);
      expect(result).toEqual({ user: publicProfile, tokens: tokenPair });
    });

    it('uses the Naver verifier for NAVER', async () => {
      naver.verify.mockResolvedValue({ provider: 'NAVER', providerUserId: 'n1', displayName: 'n' });

      await service.loginWithOAuth('NAVER', 'naver-token');

      expect(naver.verify).toHaveBeenCalledWith('naver-token');
      expect(kakao.verify).not.toHaveBeenCalled();
    });

    it('uses the Google verifier for GOOGLE', async () => {
      google.verify.mockResolvedValue({ provider: 'GOOGLE', providerUserId: 'g1', displayName: 'g' });

      await service.loginWithOAuth('GOOGLE', 'google-idtoken');

      expect(google.verify).toHaveBeenCalledWith('google-idtoken');
      expect(kakao.verify).not.toHaveBeenCalled();
      expect(naver.verify).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('consumes the refresh token and issues a fresh pair', async () => {
      const result = await service.refresh('raw-refresh');

      expect(tokens.consumeRefreshToken).toHaveBeenCalledWith('raw-refresh');
      expect(users.getById).toHaveBeenCalledWith('u1');
      expect(tokens.issueTokens).toHaveBeenCalledWith(user);
      expect(result).toEqual(tokenPair);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      await service.logout('raw-refresh');
      expect(tokens.revoke).toHaveBeenCalledWith('raw-refresh');
    });
  });
});
