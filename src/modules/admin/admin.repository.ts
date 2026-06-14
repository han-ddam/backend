import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, ilike, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { admins, type Admin, type AdminRole } from '@db/schema';

export interface CreateAdminInput {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: AdminRole;
}

export interface UpdateAdminInput {
  name?: string;
  role?: AdminRole;
  isActive?: boolean;
}

@Injectable()
export class AdminRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<Admin | undefined> {
    const [row] = await this.db.select().from(admins).where(eq(admins.id, id));
    return row;
  }

  async findByEmail(email: string): Promise<Admin | undefined> {
    const [row] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.email, email));
    return row;
  }

  async create(input: CreateAdminInput): Promise<Admin> {
    const [row] = await this.db
      .insert(admins)
      .values({
        id: input.id,
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.name,
        role: input.role,
      })
      .returning();
    return row;
  }

  async list(params: {
    limit: number;
    offset: number;
    q?: string;
  }): Promise<{ rows: Admin[]; total: number }> {
    const where = params.q
      ? or(
          ilike(admins.email, `%${params.q}%`),
          ilike(admins.name, `%${params.q}%`),
        )
      : undefined;

    const rows = await this.db
      .select()
      .from(admins)
      .where(where)
      .orderBy(desc(admins.createdAt))
      .limit(params.limit)
      .offset(params.offset);

    const [{ value }] = await this.db
      .select({ value: count() })
      .from(admins)
      .where(where);

    return { rows, total: Number(value) };
  }

  async update(
    id: string,
    patch: UpdateAdminInput,
  ): Promise<Admin | undefined> {
    const [row] = await this.db
      .update(admins)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(admins.id, id))
      .returning();
    return row;
  }
}
