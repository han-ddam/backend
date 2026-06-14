import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { UsersService, type PublicProfile } from '@modules/users/users.service';
import { TokenService, type TokenPair } from './tokens/token.service';
import { LoginThrottleService } from './login-throttle.service';
import {
  KAKAO_OAUTH,
  NAVER_OAUTH,
  type OAuthVerifierPort,
} from './oauth/oauth.port';

export interface AuthResult {
  user: PublicProfile;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly loginThrottle: LoginThrottleService,
    @Inject(KAKAO_OAUTH) private readonly kakao: OAuthVerifierPort,
    @Inject(NAVER_OAUTH) private readonly naver: OAuthVerifierPort,
  ) {}

  /** Social login (auto-provisions the user on first login). */
  async loginWithOAuth(
    provider: 'KAKAO' | 'NAVER',
    accessToken: string,
  ): Promise<AuthResult> {
    const verifier = provider === 'KAKAO' ? this.kakao : this.naver;
    const profile = await verifier.verify(accessToken);
    const user = await this.users.provisionFromOAuth(profile);
    return {
      user: this.users.toPublicProfile(user),
      tokens: await this.tokens.issueTokens(user),
    };
  }

  /** Email/password login — admin/staff accounts only. */
  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    await this.loginThrottle.assertNotLocked(email);

    const user = await this.users.findByEmail(email);
    if (!user?.passwordHash || !(await verify(user.passwordHash, password))) {
      await this.loginThrottle.recordFailure(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.loginThrottle.reset(email);
    return {
      user: this.users.toPublicProfile(user),
      tokens: await this.tokens.issueTokens(user),
    };
  }

  /** Rotate a refresh token into a fresh pair. */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const userId = await this.tokens.consumeRefreshToken(rawRefreshToken);
    const user = await this.users.getById(userId);
    return this.tokens.issueTokens(user);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    await this.tokens.revoke(rawRefreshToken);
  }
}
