import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProfile } from '@modules/users/users.service';
import type { OAuthVerifierPort } from './oauth.port';

interface GoogleTokenInfo {
  sub?: string;
  email?: string;
  name?: string;
  aud?: string;
}

/**
 * Verifies a Google ID token via Google's tokeninfo endpoint.
 * Client (RN Google Sign-In) sends the ID token; we validate signature/expiry
 * there and (if GOOGLE_CLIENT_ID is set) check the audience.
 */
@Injectable()
export class GoogleOAuthAdapter implements OAuthVerifierPort {
  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<OAuthProfile> {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) {
      throw new UnauthorizedException('Invalid Google token');
    }
    const data = (await res.json()) as GoogleTokenInfo;
    if (!data.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }
    const expectedAud = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (expectedAud && data.aud !== expectedAud) {
      throw new UnauthorizedException('Google token audience mismatch');
    }
    return {
      provider: 'GOOGLE',
      providerUserId: data.sub,
      displayName: data.name ?? '구글사용자',
      email: data.email ?? null,
    };
  }
}
