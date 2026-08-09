import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
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
      reactivate: jest.fn(),
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

    it('reactivates a WITHDRAWN user then issues tokens', async () => {
      const withdrawn = { id: 'u1', status: 'WITHDRAWN' };
      const revived = { id: 'u1', status: 'ACTIVE' };
      kakao.verify.mockResolvedValue({ provider: 'KAKAO', providerUserId: '1', displayName: 'x' });
      users.provisionFromOAuth.mockResolvedValue(withdrawn);
      users.reactivate.mockResolvedValue(revived);

      const result = await service.loginWithOAuth('KAKAO', 'tok');

      expect(users.reactivate).toHaveBeenCalledWith('u1');
      expect(tokens.issueTokens).toHaveBeenCalledWith(revived); // 복원된 유저로 발급
      expect(result).toEqual({ user: publicProfile, tokens: tokenPair });
    });

    it('rejects a SUSPENDED user with 403', async () => {
      kakao.verify.mockResolvedValue({ provider: 'KAKAO', providerUserId: '1', displayName: 'x' });
      users.provisionFromOAuth.mockResolvedValue({ id: 'u1', status: 'SUSPENDED' });
      await expect(service.loginWithOAuth('KAKAO', 'tok')).rejects.toThrow(ForbiddenException);
      expect(users.reactivate).not.toHaveBeenCalled();
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

describe('AuthService email auth', () => {
  const tokens = { issueTokens: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }) };
  const publicProfile = (u: any) => ({ id: u.id, handle: u.handle, displayName: u.displayName });

  const makeUsers = () => ({
    signupWithEmail: jest.fn(),
    findByEmail: jest.fn(),
    toPublicProfile: jest.fn(publicProfile),
  });
  // AuthService(users, tokens, kakao, naver, google) — verifier 목은 이메일 경로에서 미사용
  const noop = { verify: jest.fn() };
  const make = (users: any) =>
    new AuthService(users as any, tokens as any, noop as any, noop as any, noop as any);

  const activeUser = async () => ({
    id: 'u1', handle: 'user_aa', displayName: '테스터', email: 't@x.com',
    status: 'ACTIVE', passwordHash: await hash('password1'),
    locale: 'KO', createdAt: new Date(), updatedAt: new Date(),
  });

  afterEach(() => jest.clearAllMocks());

  it('login: success issues tokens and returns public profile', async () => {
    const users = makeUsers();
    users.findByEmail.mockResolvedValue(await activeUser());
    const res = await make(users).loginWithEmail('t@x.com', 'password1');
    expect(res.user).toEqual({ id: 'u1', handle: 'user_aa', displayName: '테스터' });
    expect(res.tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(tokens.issueTokens).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });

  it('login: unknown email → 401', async () => {
    const users = makeUsers();
    users.findByEmail.mockResolvedValue(undefined);
    await expect(make(users).loginWithEmail('no@x.com', 'password1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('login: social account (null passwordHash) → 401', async () => {
    const users = makeUsers();
    users.findByEmail.mockResolvedValue({ ...(await activeUser()), passwordHash: null });
    await expect(make(users).loginWithEmail('t@x.com', 'password1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('login: wrong password → 401', async () => {
    const users = makeUsers();
    users.findByEmail.mockResolvedValue(await activeUser());
    await expect(make(users).loginWithEmail('t@x.com', 'WRONG')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.issueTokens).not.toHaveBeenCalled();
  });

  it('login: SUSPENDED → 403', async () => {
    const users = makeUsers();
    users.findByEmail.mockResolvedValue({ ...(await activeUser()), status: 'SUSPENDED' });
    await expect(make(users).loginWithEmail('t@x.com', 'password1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('login: WITHDRAWN → 403', async () => {
    const users = makeUsers();
    users.findByEmail.mockResolvedValue({ ...(await activeUser()), status: 'WITHDRAWN' });
    await expect(make(users).loginWithEmail('t@x.com', 'password1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('signup: returns user + tokens', async () => {
    const users = makeUsers();
    users.signupWithEmail.mockResolvedValue(await activeUser());
    const res = await make(users).signupWithEmail('t@x.com', 'password1', '테스터');
    expect(users.signupWithEmail).toHaveBeenCalledWith('t@x.com', 'password1', '테스터');
    expect(res.user).toEqual({ id: 'u1', handle: 'user_aa', displayName: '테스터' });
    expect(res.tokens).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });
});
