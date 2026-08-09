import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import {
  users,
  oauthIdentity,
  userPlaceRepresentative,
  userRegionRepresentative,
  certifications,
  visits,
  placeRatings,
  userPlaceBookmarks,
  scoreEvents,
  userBadges,
  refreshTokens,
  type User,
  type authProviderEnum,
  type userStatusEnum,
} from '@db/schema';

type Provider = (typeof authProviderEnum.enumValues)[number];
type UserStatus = (typeof userStatusEnum.enumValues)[number];

export interface CreateUserInput {
  id: string;
  handle: string;
  displayName: string;
  email?: string | null;
}

export interface CreateEmailUserInput {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  passwordHash: string;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row;
  }

  /** 이메일 계정 생성(oauth_identity 없음). email unique 위반은 서비스에서 사전 체크. */
  async createEmailUser(input: CreateEmailUserInput): Promise<User> {
    const [user] = await this.db
      .insert(users)
      .values({
        id: input.id,
        handle: input.handle,
        displayName: input.displayName,
        email: input.email,
        passwordHash: input.passwordHash,
      })
      .returning();
    return user;
  }

  /** 이메일로 유저 조회(passwordHash 포함). 로그인/가입 중복체크용. */
  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email));
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

  /** Paginated member list with optional search (handle/displayName/email). */
  async list(params: {
    limit: number;
    offset: number;
    q?: string;
  }): Promise<{ rows: User[]; total: number }> {
    const where = params.q
      ? or(
          ilike(users.handle, `%${params.q}%`),
          ilike(users.displayName, `%${params.q}%`),
          ilike(users.email, `%${params.q}%`),
        )
      : undefined;

    const rows = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(params.limit)
      .offset(params.offset);

    const [{ value }] = await this.db
      .select({ value: count() })
      .from(users)
      .where(where);

    return { rows, total: Number(value) };
  }

  async updateStatus(
    id: string,
    status: UserStatus,
  ): Promise<User | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return row;
  }

  /**
   * 소프트 탈퇴: 유저 소유 활동 데이터 + refresh_token 삭제 후 status=WITHDRAWN.
   * users 행/oauth_identity/user_agreement/제출 장소는 보존(tombstone·복원용).
   */
  async withdraw(userId: string): Promise<User | undefined> {
    return this.db.transaction(async (tx) => {
      // 활동 데이터 삭제 (전부 cascade 관계지만 명시적으로 userId 기준 삭제)
      await tx.delete(userPlaceRepresentative).where(eq(userPlaceRepresentative.userId, userId));
      await tx.delete(userRegionRepresentative).where(eq(userRegionRepresentative.userId, userId));
      await tx.delete(certifications).where(eq(certifications.userId, userId)); // certification_image는 FK cascade
      await tx.delete(visits).where(eq(visits.userId, userId));
      await tx.delete(placeRatings).where(eq(placeRatings.userId, userId));
      await tx.delete(userPlaceBookmarks).where(eq(userPlaceBookmarks.userId, userId));
      await tx.delete(scoreEvents).where(eq(scoreEvents.userId, userId));
      await tx.delete(userBadges).where(eq(userBadges.userId, userId));
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId)); // 강제 로그아웃
      const [row] = await tx
        .update(users)
        .set({ status: 'WITHDRAWN', updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      return row;
    });
  }
}
