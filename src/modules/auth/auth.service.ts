import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UsersService, type PublicProfile } from '@modules/users/users.service';
import { TokenService, type TokenPair } from './tokens/token.service';
import {
  KAKAO_OAUTH,
  NAVER_OAUTH,
  type OAuthVerifierPort,
} from './oauth/oauth.port';

export interface AuthResult {
  user: PublicProfile;
  tokens: TokenPair;
}

/** Member authentication — social login only (Kakao/Naver). */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    @Inject(KAKAO_OAUTH) private readonly kakao: OAuthVerifierPort,
    @Inject(NAVER_OAUTH) private readonly naver: OAuthVerifierPort,
  ) {}

  /** Social login (auto-provisions the member on first login). */
  async loginWithOAuth(
    provider: 'KAKAO' | 'NAVER',
    accessToken: string,
  ): Promise<AuthResult> {
    const verifier = provider === 'KAKAO' ? this.kakao : this.naver;
    const profile = await verifier.verify(accessToken);
    const user = await this.users.provisionFromOAuth(profile);
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account suspended');
    }
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
