import { ConflictException, NotFoundException } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let repo: any;
  let id: any;
  let service: UsersService;

  beforeEach(() => {
    repo = {
      findByOAuth: jest.fn(),
      createUserWithOAuth: jest.fn(),
      handleExists: jest.fn().mockResolvedValue(false),
      list: jest.fn(),
      updateStatus: jest.fn(),
      withdraw: jest.fn(),
    };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    service = new UsersService(repo, id);
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
      expect(userInput).toMatchObject({ displayName: '길동', email: 'a@b.com' });
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

  describe('member management', () => {
    const member = {
      id: 'u1',
      handle: 'user_x',
      displayName: '길동',
      email: 'a@b.com',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
    };

    it('lists members with pagination metadata', async () => {
      repo.list.mockResolvedValue({ rows: [member], total: 1 });

      const result = await service.listMembers({ page: 2, limit: 10, q: 'gil' });

      expect(repo.list).toHaveBeenCalledWith({ limit: 10, offset: 10, q: 'gil' });
      expect(result).toEqual({
        items: [
          {
            id: 'u1',
            handle: 'user_x',
            displayName: '길동',
            email: 'a@b.com',
            status: 'ACTIVE',
            createdAt: member.createdAt,
          },
        ],
        total: 1,
        page: 2,
        limit: 10,
      });
    });

    it('suspends a member', async () => {
      repo.updateStatus.mockResolvedValue({ ...member, status: 'SUSPENDED' });
      const result = await service.setStatus('u1', 'SUSPENDED');
      expect(repo.updateStatus).toHaveBeenCalledWith('u1', 'SUSPENDED');
      expect(result.status).toBe('SUSPENDED');
    });

    it('throws when suspending a missing member', async () => {
      repo.updateStatus.mockResolvedValue(undefined);
      await expect(service.setStatus('nope', 'SUSPENDED')).rejects.toThrow();
    });
  });

  describe('withdraw', () => {
    it('returns {withdrawn:true} when repo withdraws the user', async () => {
      repo.withdraw.mockResolvedValue({ id: 'u1', status: 'WITHDRAWN' });
      const out = await service.withdraw('u1');
      expect(repo.withdraw).toHaveBeenCalledWith('u1');
      expect(out).toEqual({ withdrawn: true });
    });

    it('throws 404 when user not found', async () => {
      repo.withdraw.mockResolvedValue(undefined);
      await expect(service.withdraw('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivate', () => {
    it('sets status ACTIVE and returns the user', async () => {
      const u = { id: 'u1', status: 'ACTIVE' };
      repo.updateStatus.mockResolvedValue(u);
      const out = await service.reactivate('u1');
      expect(repo.updateStatus).toHaveBeenCalledWith('u1', 'ACTIVE');
      expect(out).toBe(u);
    });

    it('throws 404 when user not found', async () => {
      repo.updateStatus.mockResolvedValue(undefined);
      await expect(service.reactivate('nope')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('UsersService.signupWithEmail', () => {
  const makeRepo = () => ({
    findByEmail: jest.fn().mockResolvedValue(undefined),
    createEmailUser: jest.fn(async (i: any) => ({
      id: i.id, handle: i.handle, displayName: i.displayName, email: i.email,
      passwordHash: i.passwordHash, locale: 'KO', status: 'ACTIVE',
      createdAt: new Date(), updatedAt: new Date(),
    })),
    handleExists: jest.fn().mockResolvedValue(false),
  });
  const id = { generate: jest.fn(() => 'u-1') };

  it('creates an ACTIVE email user with an argon2 hash and generated handle', async () => {
    const repo = makeRepo();
    const svc = new UsersService(repo as any, id as any);
    const user = await svc.signupWithEmail('t@x.com', 'password1', '테스터');
    expect(repo.createEmailUser).toHaveBeenCalledTimes(1);
    const arg = repo.createEmailUser.mock.calls[0][0];
    expect(arg.email).toBe('t@x.com');
    expect(arg.displayName).toBe('테스터');
    expect(arg.handle).toMatch(/^user_[0-9a-f]{8}$/);
    expect(arg.passwordHash).toMatch(/^\$argon2/);
    expect(await verify(arg.passwordHash, 'password1')).toBe(true);
    expect(user.status).toBe('ACTIVE');
    expect((user as any).id).toBe('u-1');
  });

  it('defaults displayName when omitted', async () => {
    const repo = makeRepo();
    const svc = new UsersService(repo as any, id as any);
    await svc.signupWithEmail('t@x.com', 'password1');
    expect(repo.createEmailUser.mock.calls[0][0].displayName).toBe('테스터');
  });

  it('rejects duplicate email with ConflictException', async () => {
    const repo = makeRepo();
    repo.findByEmail.mockResolvedValue({ id: 'existing' });
    const svc = new UsersService(repo as any, id as any);
    await expect(svc.signupWithEmail('t@x.com', 'password1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.createEmailUser).not.toHaveBeenCalled();
  });
});
