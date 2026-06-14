import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

jest.mock('@node-rs/argon2', () => ({ hash: jest.fn() }));
import { hash } from '@node-rs/argon2';

const hashMock = hash as jest.Mock;

describe('UsersService', () => {
  let repo: any;
  let id: any;
  let service: UsersService;

  beforeEach(() => {
    repo = {
      findByOAuth: jest.fn(),
      createUserWithOAuth: jest.fn(),
      createUser: jest.fn(),
      findByEmail: jest.fn(),
      handleExists: jest.fn().mockResolvedValue(false),
    };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    service = new UsersService(repo, id);
    hashMock.mockReset();
  });

  describe('provisionFromOAuth', () => {
    const profile = {
      provider: 'KAKAO' as const,
      providerUserId: '123',
      displayName: '길동',
      email: 'a@b.com',
    };

    it('returns the existing user when the identity is known', async () => {
      const existing = { id: 'u1' };
      repo.findByOAuth.mockResolvedValue(existing);

      const result = await service.provisionFromOAuth(profile);

      expect(result).toBe(existing);
      expect(repo.createUserWithOAuth).not.toHaveBeenCalled();
    });

    it('creates a user + identity on first login', async () => {
      repo.findByOAuth.mockResolvedValue(undefined);
      const created = { id: 'id-1' };
      repo.createUserWithOAuth.mockResolvedValue(created);

      const result = await service.provisionFromOAuth(profile);

      expect(repo.createUserWithOAuth).toHaveBeenCalledTimes(1);
      const [userInput, oauthInput] = repo.createUserWithOAuth.mock.calls[0];
      expect(userInput).toMatchObject({ displayName: '길동', email: 'a@b.com', role: 'USER' });
      expect(userInput.handle).toMatch(/^user_[0-9a-f]{8}$/);
      expect(oauthInput).toMatchObject({ provider: 'KAKAO', providerUserId: '123' });
      expect(result).toBe(created);
    });

    it('retries handle generation on collision', async () => {
      repo.findByOAuth.mockResolvedValue(undefined);
      repo.handleExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      repo.createUserWithOAuth.mockResolvedValue({ id: 'x' });

      await service.provisionFromOAuth(profile);

      expect(repo.handleExists).toHaveBeenCalledTimes(2);
    });
  });

  describe('createEmailUser', () => {
    it('hashes the password and defaults to ADMIN role', async () => {
      repo.findByEmail.mockResolvedValue(undefined);
      hashMock.mockResolvedValue('hashed-pw');
      repo.createUser.mockResolvedValue({ id: 'a1' });

      await service.createEmailUser({
        email: 'admin@x.com',
        password: 'secret',
        displayName: '관리자',
      });

      expect(hashMock).toHaveBeenCalledWith('secret');
      const input = repo.createUser.mock.calls[0][0];
      expect(input).toMatchObject({
        email: 'admin@x.com',
        passwordHash: 'hashed-pw',
        role: 'ADMIN',
      });
    });

    it('rejects a duplicate email', async () => {
      repo.findByEmail.mockResolvedValue({ id: 'exists' });

      await expect(
        service.createEmailUser({ email: 'dup@x.com', password: 'p', displayName: 'd' }),
      ).rejects.toThrow(ConflictException);
      expect(repo.createUser).not.toHaveBeenCalled();
    });
  });
});
