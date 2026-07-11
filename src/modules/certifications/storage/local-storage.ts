import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { Readable } from 'node:stream';
import type { Env } from '@platform/config/env';
import { IdService } from '@platform/id/id.service';
import { StoragePort, MIME_EXT, EXT_MIME } from './storage.port';

/** 미니PC 로컬 디스크(STORAGE_DIR) 기반 저장소. 키는 certifications/<id>.<ext>. */
@Injectable()
export class LocalStorage implements StoragePort {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly id: IdService,
  ) {}

  private get root(): string {
    return this.config.get('STORAGE_DIR', { infer: true });
  }

  async save(buffer: Buffer, mime: string): Promise<{ key: string }> {
    const ext = MIME_EXT[mime];
    if (!ext) throw new Error(`unsupported mime: ${mime}`);
    const key = `certifications/${this.id.generate()}.${ext}`;
    const full = join(this.root, key);
    await mkdir(join(this.root, 'certifications'), { recursive: true });
    await writeFile(full, buffer);
    return { key };
  }

  async read(key: string): Promise<{ stream: Readable; mime: string } | null> {
    if (!(await this.exists(key))) return null;
    const ext = extname(key).slice(1);
    const mime = EXT_MIME[ext] ?? 'application/octet-stream';
    return { stream: createReadStream(join(this.root, key)), mime };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(join(this.root, key));
      return true;
    } catch {
      return false;
    }
  }
}
