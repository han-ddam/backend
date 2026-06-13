import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { OAuthProfile } from '@modules/users/users.service';
import type { OAuthVerifierPort } from './oauth.port';

interface KakaoMe {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: { nickname?: string };
  };
}

/** Verifies a Kakao access token via the Kakao user-info API. */
@Injectable()
export class KakaoOAuthAdapter implements OAuthVerifierPort {
  async verify(accessToken: string): Promise<OAuthProfile> {
    const res = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new UnauthorizedException('Invalid Kakao access token');
    }
    const data = (await res.json()) as KakaoMe;
    return {
      provider: 'KAKAO',
      providerUserId: String(data.id),
      displayName: data.kakao_account?.profile?.nickname ?? '카카오사용자',
      email: data.kakao_account?.email ?? null,
    };
  }
}
