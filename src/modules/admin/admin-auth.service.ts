import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { AdminService, type AdminProfile } from './admin.service';
import { AdminTokenService, type TokenPair } from './tokens/admin-token.service';
import { LoginThrottleService } from './login-throttle.service';

export interface AdminAuthResult {
  admin: AdminProfile;
  tokens: TokenPair;
}

/** Admin authentication — email + password only. */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly admins: AdminService,
    private readonly tokens: AdminTokenService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  async login(email: string, password: string): Promise<AdminAuthResult> {
    await this.loginThrottle.assertNotLocked(email);

    const admin = await this.admins.findByEmail(email);
    if (
      !admin ||
      !admin.isActive ||
      !(await verify(admin.passwordHash, password))
    ) {
      await this.loginThrottle.recordFailure(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.loginThrottle.reset(email);
    return {
      admin: this.admins.toProfile(admin),
      tokens: await this.tokens.issueTokens(admin),
    };
  }

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const adminId = await this.tokens.consumeRefreshToken(rawRefreshToken);
    const admin = await this.admins.getById(adminId);
    return this.tokens.issueTokens(admin);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.tokens.revoke(rawRefreshToken);
  }
}
