import { Global, Module } from '@nestjs/common';
import { STORAGE } from './storage.port';
import { LocalStorage } from './local-storage';

/** 공용 파일 저장(로컬 디스크). STORAGE 토큰을 전역 제공. S3 전환 시 여기만 교체. */
@Global()
@Module({
  providers: [{ provide: STORAGE, useClass: LocalStorage }],
  exports: [STORAGE],
})
export class StorageModule {}
