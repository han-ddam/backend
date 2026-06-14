import { UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';

jest.mock('@node-rs/argon2', () => ({ verify: jest.fn() }));
import { verify } from '@node-rs/argon2';

const verifyMock = verify as jest.Mock;

describe('AdminAuthService', () => {
  let admins: any;
  let tokens: any;
  let throttle: any;
  let service: AdminAuthService;

  const admin = { id: 'a1', role: 'ADMIN', isActive: true, passwordHash: 'hash' };
  const profile = { id: 'a1', email: 'a@x.com', name: '관리자', role: 'ADMIN' };
  const tokenPair = { accessToken: 'a', refreshToken: 'r' };

  beforeEach(() => {
    admins = {
      findByEmail: jest.fn(),
      getById: jest.fn().mockResolvedValue(admin),
      toProfile: jest.fn().mockReturnValue(profile),
    };
    tokens = {
      issueTokens: jest.fn().mockResolvedValue(tokenPair),
      consumeRefreshToken: jest.fn().mockResolvedValue('a1'),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    throttle = {
      assertNotLocked: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };
    service = new AdminAuthService(admins, tokens, throttle);
    verifyMock.mockReset();
  });

  it('logs in with valid credentials and resets failures', async () => {
    admins.findByEmail.mockResolvedValue(admin);
    verifyMock.mockResolvedValue(true);

    const result = await service.login('a@x.com', 'pw');

    expect(throttle.assertNotLocked).toHaveBeenCalledWith('a@x.com');
    expect(throttle.reset).toHaveBeenCalledWith('a@x.com');
    expect(tokens.issueTokens).toHaveBeenCalledWith(admin);
    expect(result).toEqual({ admin: profile, tokens: tokenPair });
  });

  it('rejects and records failure on wrong password', async () => {
    admins.findByEmail.mockResolvedValue(admin);
    verifyMock.mockResolvedValue(false);

    await expect(service.login('a@x.com', 'bad')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(throttle.recordFailure).toHaveBeenCalledWith('a@x.com');
  });

  it('rejects an inactive admin', async () => {
    admins.findByEmail.mockResolvedValue({ ...admin, isActive: false });
    await expect(service.login('a@x.com', 'pw')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('rejects immediately when locked', async () => {
    throttle.assertNotLocked.mockRejectedValue(new Error('locked'));
    await expect(service.login('a@x.com', 'pw')).rejects.toThrow();
    expect(admins.findByEmail).not.toHaveBeenCalled();
  });
});
