import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { admins, type Admin, type AdminRole } from '@db/schema';

export interface CreateAdminInput {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: AdminRole;
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
}
