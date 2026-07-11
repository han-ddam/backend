import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '@platform/config/env';

/**
 * BullMQ 루트 연결(Redis). REDIS_URL을 ioredis 연결 옵션으로 파싱.
 * 개별 큐는 각 도메인 모듈에서 registerQueue로 등록한다.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = new URL(config.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port) || 6379,
            // BullMQ 요구사항 (RedisModule과 동일)
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
