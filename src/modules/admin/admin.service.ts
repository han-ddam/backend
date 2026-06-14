import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { IdService } from '@platform/id/id.service';
import type { Admin, AdminRole } from '@db/schema';
import { AdminRepository, type UpdateAdminInput } from './admin.repository';

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: Date;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly id: IdService,
  ) {}

  async getById(id: string): Promise<Admin> {
    const admin = await this.repo.findById(id);
    if (!admin) throw new NotFoundException('Admin not found');
    return admin;
  }

  findByEmail(email: string): Promise<Admin | undefined> {
    return this.repo.findByEmail(email);
  }

  async createAdmin(input: {
    email: string;
    password: string;
    name: string;
    role?: AdminRole;
  }): Promise<Admin> {
    if (await this.repo.findByEmail(input.email)) {
      throw new ConflictException('Email already in use');
    }
    return this.repo.create({
      id: this.id.generate(),
      email: input.email,
      passwordHash: await hash(input.password),
      name: input.name,
      role: input.role ?? 'ADMIN',
    });
  }

  // --- admin management (SUPER_ADMIN) ---

  async listAdmins(params: {
    page: number;
    limit: number;
    q?: string;
  }): Promise<Paginated<AdminProfile>> {
    const { rows, total } = await this.repo.list({
      limit: params.limit,
      offset: (params.page - 1) * params.limit,
      q: params.q,
    });
    return {
      items: rows.map((a) => this.toProfile(a)),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getAdmin(id: string): Promise<AdminProfile> {
    return this.toProfile(await this.getById(id));
  }

  async updateAdmin(id: string, patch: UpdateAdminInput): Promise<AdminProfile> {
    const updated = await this.repo.update(id, patch);
    if (!updated) throw new NotFoundException('Admin not found');
    return this.toProfile(updated);
  }

  toProfile(admin: Admin): AdminProfile {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    };
  }
}
