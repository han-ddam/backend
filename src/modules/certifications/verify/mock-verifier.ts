import { Injectable } from '@nestjs/common';
import { VerifierPort, VerifyInput } from './verifier.port';

/** MVP: 항상 통과. 후속에서 실제 AI 검증기로 교체/체이닝. */
@Injectable()
export class MockVerifier implements VerifierPort {
  async verify(_cert: VerifyInput): Promise<{ pass: boolean; reason?: string }> {
    return { pass: true };
  }
}
