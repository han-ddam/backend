import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('@node-rs/argon2', () => ({ verify: jest.fn() }));
import { verify } from '@node-rs/argon2';

const verifyMock = verify as jest.Mock;

describe('AuthService', () => {
  let users: any;
  let tokens: any;
  let kakao: any;
  let naver: any;
  let service: AuthService;

  const user = { id: 'u1', role: 'USER', passwordHash: 'hash' };
  const publicProfile = { id: 'u1', handle: 'user_x', displayName: '길동', role: 'USER' };
  const tokenPair = { accessToken: 'a', refreshToken: 'r' };

  beforeEach(() => {
    users = {
      provisionFromOAuth: jest.fn().mockResolvedValue(user),
      toPublicProfile: jest.fn().mockReturnValue(publicProfile),
      findByEmail: jest.fn(),
      getById: jest.fn().mockResolvedValue(user),
    };
    tokens = {
      issueTokens: jest.fn().mockResolvedValue(tokenPair),
      consumeRefreshToken: jest.fn().mockResolvedValue('u1'),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    kakao = { verify: jest.fn() };
    naver = { verify: jest.fn() };
    service = new AuthService(users, tokens, kakao, naver);
    verifyMock.mockReset();
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
  });

  describe('loginWithEmail', () => {
    it('issues tokens on valid credentials', async () => {
      users.findByEmail.mockResolvedValue(user);
      verifyMock.mockResolvedValue(true);

      const result = await service.loginWithEmail('admin@x.com', 'pw');

      expect(verifyMock).toHaveBeenCalledWith('hash', 'pw');
      expect(tokens.issueTokens).toHaveBeenCalledWith(user);
      expect(result.tokens).toEqual(tokenPair);
    });

    it('rejects when the user does not exist', async () => {
      users.findByEmail.mockResolvedValue(undefined);
      await expect(service.loginWithEmail('x@x.com', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(tokens.issueTokens).not.toHaveBeenCalled();
    });

    it('rejects a social-only user (no password hash)', async () => {
      users.findByEmail.mockResolvedValue({ id: 'u2', role: 'USER', passwordHash: null });
      await expect(service.loginWithEmail('x@x.com', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(verifyMock).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      users.findByEmail.mockResolvedValue(user);
      verifyMock.mockResolvedValue(false);
      await expect(service.loginWithEmail('admin@x.com', 'bad')).rejects.toThrow(
        UnauthorizedException,
      );
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
