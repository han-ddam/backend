import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import { IdService } from '@platform/id/id.service';
import type { Admin, AdminRole } from '@db/schema';
import { AdminRepository } from './admin.repository';

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
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

  toProfile(admin: Admin): AdminProfile {
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role };
  }
}
