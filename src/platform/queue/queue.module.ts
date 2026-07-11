import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import type { Env } from '@platform/config/env';

/**
 * BullMQ 루트 연결(Redis). REDIS_URL 전체 문자열을 ioredis에 그대로 전달하여
 * auth/db/tls를 보존한다 (RedisModule과 동일 패턴, 단 전용 연결 사용).
 * 개별 큐는 각 도메인 모듈에서 registerQueue로 등록한다.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // pnpm이 ioredis를 이중 설치(bullmq 전용 고정 버전 vs 앱 버전)하면서
        // 구조적으로 동일한 Redis 인스턴스가 서로 다른 타입으로 인식될 수 있어 캐스팅한다.
        connection: new Redis(config.get('REDIS_URL', { infer: true }), {
          maxRetriesPerRequest: null, // BullMQ 요구사항
        }) as unknown as ConnectionOptions,
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
