import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Env } from '@platform/config/env';
import { CompositionGeneratorPort, CompositionGenInput, CompositionGenResult } from './generator.port';

@Injectable()
export class GeminiGenerator implements CompositionGeneratorPort {
  private readonly logger = new Logger(GeminiGenerator.name);
  private readonly count: number;
  readonly enabled: boolean;
  private model: any = null;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    const key = config.get('GEMINI_API_KEY', { infer: true });
    this.count = config.get('COMPOSITION_COUNT', { infer: true });
    this.enabled = !!key;
    if (key) {
      const genAI = new GoogleGenerativeAI(key);
      this.model = genAI.getGenerativeModel({
        model: config.get('GEMINI_MODEL', { infer: true }),
        generationConfig: {
          responseMimeType: 'application/json',
          // SDK 버전에 맞춰 responseSchema 형식 조정(설치 버전 타입 확인). 없으면 mimeType만으로도 JSON 유도 가능.
        } as any,
      });
    }
  }

  private sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

  async generate(input: CompositionGenInput): Promise<CompositionGenResult> {
    if (!this.model) throw new Error('generator disabled');
    const prompt =
      `한국 여행지 "${input.placeName}" (${input.regionName}${input.description ? `, ${input.description}` : ''})에서 ` +
      `사진 잘 찍는 촬영 구도 팁 ${this.count}개를 한국어로. ` +
      `각 항목은 title(짧은 제목)과 description(2~3문장). ` +
      `JSON만 출력: {"compositions":[{"title":"","description":""}]}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.model.generateContent(prompt);
        const parsed = JSON.parse(res.response.text());
        const items = Array.isArray(parsed?.compositions) ? parsed.compositions : [];
        return {
          items: items
            .filter((c: any) => c && typeof c.title === 'string' && typeof c.description === 'string')
            .slice(0, this.count)
            .map((c: any) => ({ title: c.title, description: c.description })),
        };
      } catch (e: any) {
        lastErr = e;
        const status = e?.status ?? e?.response?.status;
        if (status === 429 || (status >= 500 && status < 600)) {
          this.logger.warn(`generation attempt ${attempt + 1} failed (status ${status}): ${e}`);
          if (attempt < 2) await this.sleep(2000 * 2 ** attempt); // 2s,4s
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }
}
