import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

jest.mock('@node-rs/argon2', () => ({ hash: jest.fn() }));
import { hash } from '@node-rs/argon2';

const hashMock = hash as jest.Mock;

describe('AdminService', () => {
  let repo: any;
  let id: any;
  let service: AdminService;

  const admin = {
    id: 'a1',
    email: 'a@x.com',
    name: '관리자',
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
    };
    let seq = 0;
    id = { generate: jest.fn(() => `id-${++seq}`) };
    service = new AdminService(repo, id);
    hashMock.mockReset();
  });

  describe('createAdmin', () => {
    it('hashes the password and defaults role to ADMIN', async () => {
      repo.findByEmail.mockResolvedValue(undefined);
      hashMock.mockResolvedValue('hashed');
      repo.create.mockResolvedValue(admin);

      await service.createAdmin({ email: 'a@x.com', password: 'pw', name: '관리자' });

      expect(hashMock).toHaveBeenCalledWith('pw');
      expect(repo.create.mock.calls[0][0]).toMatchObject({
        email: 'a@x.com',
        passwordHash: 'hashed',
        role: 'ADMIN',
      });
    });

    it('rejects a duplicate email', async () => {
      repo.findByEmail.mockResolvedValue(admin);
      await expect(
        service.createAdmin({ email: 'a@x.com', password: 'pw', name: 'n' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listAdmins', () => {
    it('maps rows to profiles with pagination', async () => {
      repo.list.mockResolvedValue({ rows: [admin], total: 1 });

      const result = await service.listAdmins({ page: 1, limit: 20 });

      expect(repo.list).toHaveBeenCalledWith({ limit: 20, offset: 0, q: undefined });
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({ id: 'a1', role: 'ADMIN', isActive: true });
    });
  });

  describe('updateAdmin', () => {
    it('updates and returns the profile', async () => {
      repo.update.mockResolvedValue({ ...admin, role: 'SUPER_ADMIN' });
      const result = await service.updateAdmin('a1', { role: 'SUPER_ADMIN' });
      expect(repo.update).toHaveBeenCalledWith('a1', { role: 'SUPER_ADMIN' });
      expect(result.role).toBe('SUPER_ADMIN');
    });

    it('throws when the admin is missing', async () => {
      repo.update.mockResolvedValue(undefined);
      await expect(service.updateAdmin('nope', { isActive: false })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
