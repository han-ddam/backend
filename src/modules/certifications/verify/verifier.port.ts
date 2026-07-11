/** 인증 검증 추상화. Mock(지금) ↔ AI 랜드마크/모더레이션/구도(후속) 교체·체이닝 지점. */
export const VERIFIER = Symbol('VERIFIER');

export interface VerifyInput {
  id: string;
  placeId: string;
  imageKey: string;
}

export interface VerifierPort {
  verify(cert: VerifyInput): Promise<{ pass: boolean; reason?: string }>;
}
