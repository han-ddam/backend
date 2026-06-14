import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { ClockService } from '@platform/clock/clock.service';
import { IdService } from '@platform/id/id.service';
import type { Env } from '@platform/config/env';
import { adminRefreshTokens, type Admin } from '@db/schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Admin access + refresh tokens — separate table and a `typ: 'admin'` claim so
 * member and admin tokens can never be confused.
 */
@Injectable()
export class AdminTokenService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: ClockService,
    private readonly id: IdService,
  ) {}

  async issueTokens(admin: Pick<Admin, 'id' | 'role'>): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({
      sub: admin.id,
      role: admin.role,
      typ: 'admin',
    });
    const refreshToken = await this.createRefreshToken(admin.id);
    return { accessToken, refreshToken };
  }

  async consumeRefreshToken(rawRefreshToken: string): Promise<string> {
    const tokenHash = this.hash(rawRefreshToken);
    const [row] = await this.db
      .select()
      .from(adminRefreshTokens)
      .where(eq(adminRefreshTokens.tokenHash, tokenHash));

    if (!row) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.revokedAt) {
      await this.revokeAllForAdmin(row.adminId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (row.expiresAt.getTime() <= this.clock.epochMs()) {
      throw new UnauthorizedException('Expired refresh token');
    }

    await this.db
      .update(adminRefreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(eq(adminRefreshTokens.id, row.id));
    return row.adminId;
  }

  async revoke(rawRefreshToken: string): Promise<void> {
    await this.db
      .update(adminRefreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(eq(adminRefreshTokens.tokenHash, this.hash(rawRefreshToken)));
  }

  async revokeAllForAdmin(adminId: string): Promise<void> {
    await this.db
      .update(adminRefreshTokens)
      .set({ revokedAt: this.clock.now() })
      .where(
        and(
          eq(adminRefreshTokens.adminId, adminId),
          isNull(adminRefreshTokens.revokedAt),
        ),
      );
  }

  private async createRefreshToken(adminId: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    await this.db.insert(adminRefreshTokens).values({
      id: this.id.generate(),
      adminId,
      tokenHash: this.hash(raw),
      expiresAt: new Date(this.clock.epochMs() + ttl * 1000),
    });
    return raw;
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
