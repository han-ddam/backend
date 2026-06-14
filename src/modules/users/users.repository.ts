import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  users,
  oauthIdentity,
  type User,
  type authProviderEnum,
} from '@db/schema';

type Provider = (typeof authProviderEnum.enumValues)[number];

export interface CreateUserInput {
  id: string;
  handle: string;
  displayName: string;
  email?: string | null;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async handleExists(handle: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, handle));
    return !!row;
  }

  /** Resolve the user behind a social identity, if any. */
  async findByOAuth(
    provider: Provider,
    providerUserId: string,
  ): Promise<User | undefined> {
    const [row] = await this.db
      .select({ user: users })
      .from(oauthIdentity)
      .innerJoin(users, eq(users.id, oauthIdentity.userId))
      .where(
        and(
          eq(oauthIdentity.provider, provider),
          eq(oauthIdentity.providerUserId, providerUserId),
        ),
      );
    return row?.user;
  }

  /** Create a member and its social identity atomically. */
  async createUserWithOAuth(
    input: CreateUserInput,
    oauth: { id: string; provider: Provider; providerUserId: string },
  ): Promise<User> {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          id: input.id,
          handle: input.handle,
          displayName: input.displayName,
          email: input.email ?? null,
        })
        .returning();
      await tx.insert(oauthIdentity).values({
        id: oauth.id,
        userId: user.id,
        provider: oauth.provider,
        providerUserId: oauth.providerUserId,
      });
      return user;
    });
  }
}
