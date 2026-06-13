import type { OAuthProfile } from '@modules/users/users.service';

/** A provider adapter verifies a provider access token and returns the profile. */
export interface OAuthVerifierPort {
  verify(accessToken: string): Promise<OAuthProfile>;
}

export const KAKAO_OAUTH = Symbol('KAKAO_OAUTH');
export const NAVER_OAUTH = Symbol('NAVER_OAUTH');
