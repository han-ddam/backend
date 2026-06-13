import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { OAuthProfile } from '@modules/users/users.service';
import type { OAuthVerifierPort } from './oauth.port';

interface NaverMe {
  resultcode: string;
  response?: {
    id: string;
    nickname?: string;
    name?: string;
    email?: string;
  };
}

/** Verifies a Naver access token via the Naver user-info API. */
@Injectable()
export class NaverOAuthAdapter implements OAuthVerifierPort {
  async verify(accessToken: string): Promise<OAuthProfile> {
    const res = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new UnauthorizedException('Invalid Naver access token');
    }
    const data = (await res.json()) as NaverMe;
    const p = data.response;
    if (!p?.id) {
      throw new UnauthorizedException('Invalid Naver access token');
    }
    return {
      provider: 'NAVER',
      providerUserId: p.id,
      displayName: p.nickname ?? p.name ?? '네이버사용자',
      email: p.email ?? null,
    };
  }
}
