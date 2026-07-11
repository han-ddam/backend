import type { Readable } from 'node:stream';

/** 인증 사진 저장 추상화. LocalStorage(지금) ↔ S3Storage(후속) 교체 지점. */
export const STORAGE = Symbol('STORAGE');

export interface StoragePort {
  /** 이미지 버퍼 저장 → 접근 키 반환. folder는 키 접두어(기본 certifications). 미지원 mime이면 throw. */
  save(buffer: Buffer, mime: string, folder?: string): Promise<{ key: string }>;
  /** 키로 읽기(스트림+mime). 없으면 null. */
  read(key: string): Promise<{ stream: Readable; mime: string } | null>;
  exists(key: string): Promise<boolean>;
}

export const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
