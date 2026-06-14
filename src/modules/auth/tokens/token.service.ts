import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { ClockService } from '@platform/clock/clock.service';
import { IdService } from '@platform/id/id.service';
import type { Env } from '@platform/config/env';
import { refreshTokens, type User } from '@db/schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Issues short-lived JWT access tokens and opaque, single-use refresh tokens.
 * Refresh tokens are stored only as a SHA-256 hash; the raw value is returned
 * to the client once and never persisted. Rotation/role lookup is orchestrated
 * by AuthService — this service only mints, validates, and revokes.
 */
@Injectable()
export class TokenService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: ClockService,
    private readonly id: IdService,
  ) {}

  /** Mint a new access + refresh pair for a user. */
  async issueTokens(user: Pick<User, 'id' | 'role'>): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
    });
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  /**
   * Validate a refresh token and consume it (single-use rotation): the token is
   * revoked and the owning userId returned. Throws if invalid/expired/revoked.
   */
  async consumeRefreshToken(rawRefreshToken: string): Promise<string> {
    const tokenHash = this.hash(rawRefreshToken);
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));

    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Reuse detection: a token that was already rotated/revoked is being
    // replayed — treat as theft and revoke ALL of the user's sessions.
    if (row.revokedAt) {
      await this.revokeAllForUser(row.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (row.expiresAt.getTime() <= this.clock.epochMs()) {
      throw new UnauthorizedException('Expired refresh token');
    }

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(eq(refreshTokens.id, row.id));
    return row.userId;
  }

  /** Revoke every active refresh token for a user (logout-everywhere). */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
      );
  }

  /** Revoke a refresh token (logout). No-op if unknown/already revoked. */
  async revoke(rawRefreshToken: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(eq(refreshTokens.tokenHash, this.hash(rawRefreshToken)));
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    await this.db.insert(refreshTokens).values({
      id: this.id.generate(),
      userId,
      tokenHash: this.hash(raw),
      expiresAt: new Date(this.clock.epochMs() + ttl * 1000),
    });
    return raw;
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
