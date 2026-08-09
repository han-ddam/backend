import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { UsersService, type PublicProfile } from '@modules/users/users.service';
import { TokenService, type TokenPair } from './tokens/token.service';
import {
  KAKAO_OAUTH,
  NAVER_OAUTH,
  GOOGLE_OAUTH,
  type OAuthVerifierPort,
} from './oauth/oauth.port';

export interface AuthResult {
  user: PublicProfile;
  tokens: TokenPair;
}

export type SocialProvider = 'KAKAO' | 'NAVER' | 'GOOGLE';

/** Member authentication — social login only (Kakao/Naver/Google). */
@Injectable()
export class AuthService {
  private readonly verifiers: Record<SocialProvider, OAuthVerifierPort>;

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    @Inject(KAKAO_OAUTH) kakao: OAuthVerifierPort,
    @Inject(NAVER_OAUTH) naver: OAuthVerifierPort,
    @Inject(GOOGLE_OAUTH) google: OAuthVerifierPort,
  ) {
    this.verifiers = { KAKAO: kakao, NAVER: naver, GOOGLE: google };
  }

  /** Social login (auto-provisions the member on first login). */
  async loginWithOAuth(
    provider: SocialProvider,
    accessToken: string,
  ): Promise<AuthResult> {
    const profile = await this.verifiers[provider].verify(accessToken);
    let user = await this.users.provisionFromOAuth(profile);
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('Account suspended');
    }
    if (user.status === 'WITHDRAWN') {
      user = await this.users.reactivate(user.id); // 탈퇴 계정 자동 복원
    }
    return {
      user: this.users.toPublicProfile(user),
      tokens: await this.tokens.issueTokens(user),
    };
  }

  /** 이메일 계정 가입 → 토큰 발급(테스트용). */
  async signupWithEmail(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<AuthResult> {
    const user = await this.users.signupWithEmail(email, password, displayName);
    return {
      user: this.users.toPublicProfile(user),
      tokens: await this.tokens.issueTokens(user),
    };
  }

  /** 이메일+비번 로그인. 실패는 401(열거 방지), 정지/탈퇴는 403. */
  async loginWithEmail(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!(await verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === 'SUSPENDED' || user.status === 'WITHDRAWN') {
      throw new ForbiddenException('Account not available');
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
