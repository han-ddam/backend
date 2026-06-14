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
});
