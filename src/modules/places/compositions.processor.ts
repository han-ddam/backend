import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { CompositionsRepository } from './compositions.repository';
import { GENERATOR, type CompositionGeneratorPort } from './compositions/generator/generator.port';

/** 'composition' 큐 소비 — AI 구도 lazy 생성. 멱등(generated_at 세팅되면 재실행 안 함). */
@Processor('composition')
export class CompositionsProcessor extends WorkerHost {
  private readonly logger = new Logger(CompositionsProcessor.name);
  constructor(
    private readonly repo: CompositionsRepository,
    @Inject(GENERATOR) private readonly generator: CompositionGeneratorPort,
  ) {
    super();
  }

  async process(job: Job<{ placeId: string }>): Promise<void> {
    const { placeId } = job.data;
    if (!this.generator.enabled) return;
    const gen = await this.repo.generatedAt(placeId);
    if (gen === 'MISSING' || gen !== null) return; // place 없음 or 이미 시도
    if (await this.repo.hasCompositions(placeId)) {
      await this.repo.markGenerated(placeId);
      return;
    }
    const info = await this.repo.placeGenInfo(placeId);
    if (!info || !info.name) {
      await this.repo.markGenerated(placeId);
      return;
    }
    const result = await this.generator.generate({
      placeName: info.name,
      regionName: info.regionName,
      description: info.description ?? undefined,
    });
    // 재확인: 생성 중 CSV import 등 다른 writer가 먼저 채웠으면 덮어쓰지 않음
    const after = await this.repo.generatedAt(placeId);
    if (after !== null) return;
    if (result.items.length > 0) await this.repo.insertGenerated(placeId, result.items);
    else await this.repo.markGenerated(placeId); // 0개면 표시만(무한루프 방지)
  }
}
